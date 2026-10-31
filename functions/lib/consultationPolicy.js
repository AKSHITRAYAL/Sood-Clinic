// Consultation-request scheduling contract.
//
// One doctor works across two physical locations and a video mode, and all three
// share the SAME doctor capacity. This module is the single validation/decision
// source for that contract: stable location identifiers, permitted windows, the
// 30-minute slot grid, multi-unit durations, buffers, Sunday closure, proposal
// lifetime and the Jindal "consultations only" rule.
//
// Nothing here reads a database or the clock, so every rule is unit-testable. The
// public/patient booking UI receives these identifiers and windows from the server
// (`getConsultationOptions`), never from a hard-coded browser copy. Presentation
// (address copy, marketing hours) belongs to the public content surface.
const { addIstDays, istDateKey, istInstant, weekdayIst } = require('./ist');
const { makeSlotId } = require('./availability');

const SLOT_MINUTES = 30;
const DEFAULT_PROPOSAL_LIFETIME_HOURS = 24;
const MAX_PROPOSAL_LIFETIME_HOURS = 168;
const MAX_WINDOWS = 6;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ID = /^[a-z][a-z0-9-]{2,39}$/;

const DEFAULT_LOCATIONS = Object.freeze([
  Object.freeze({
    id: 'dhawan-hospital',
    name: 'Dhawan Hospital',
    address: 'Plot No. 1-SP, Sector 7, Panchkula, Haryana 134109',
    landmark: '',
    phones: Object.freeze(['+911722596090', '+911722596091']),
    windows: Object.freeze([Object.freeze({ start: '11:00', end: '15:00' })]),
    procedureAllowed: true,
  }),
  Object.freeze({
    id: 'jindal-diagnostics',
    name: 'Jindal Diagnostics',
    address: 'Plot No. 195, Sector 10, Panchkula, Haryana 134113',
    landmark: 'Opposite Sindhi Sweets',
    phones: Object.freeze([]),
    windows: Object.freeze([
      Object.freeze({ start: '09:00', end: '11:00' }),
      Object.freeze({ start: '17:00', end: '19:00' }),
    ]),
    // OPD consultations only. Procedures must be refused server-side.
    procedureAllowed: false,
  }),
]);

const DEFAULT_VIDEO_WINDOWS = Object.freeze([
  Object.freeze({ start: '09:30', end: '10:30' }),
  Object.freeze({ start: '17:30', end: '18:30' }),
]);

const DEFAULT_POLICY = Object.freeze({
  locations: DEFAULT_LOCATIONS,
  videoWindows: DEFAULT_VIDEO_WINDOWS,
  // Sunday is the supplied default closure; it is stored policy, not a hard-coded
  // weekly rule, so authorised scheduling settings can change it.
  closedWeekdays: Object.freeze([0]),
  proposalLifetimeHours: DEFAULT_PROPOSAL_LIFETIME_HOURS,
  services: Object.freeze({}),
  source: 'default',
  updatedAt: null,
  updatedBy: null,
});

const minutesFor = (value) => {
  if (!TIME.test(String(value || ''))) return NaN;
  const [hour, minute] = String(value).split(':').map(Number);
  return hour * 60 + minute;
};
const timeFor = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const normaliseWindow = (value) => {
  if (!value || typeof value !== 'object') return null;
  const start = String(value.start || '');
  const end = String(value.end || '');
  if (!TIME.test(start) || !TIME.test(end) || minutesFor(start) >= minutesFor(end)) return null;
  return { start, end };
};

// Sorted, de-duplicated, non-overlapping windows. Overlaps are merged so a window
// edit can never produce the same slot twice.
const normaliseWindows = (value, { max = MAX_WINDOWS } = {}) => {
  if (!Array.isArray(value) || value.length > max) return null;
  const windows = value.map(normaliseWindow);
  if (windows.some((window) => !window)) return null;
  windows.sort((left, right) => minutesFor(left.start) - minutesFor(right.start));
  const merged = [];
  for (const window of windows) {
    const last = merged[merged.length - 1];
    if (last && minutesFor(window.start) <= minutesFor(last.end)) last.end = timeFor(Math.max(minutesFor(last.end), minutesFor(window.end)));
    else merged.push({ ...window });
  }
  return merged;
};

const normaliseLocation = (value) => {
  if (!value || typeof value !== 'object') throw new Error('CONSULTATION_POLICY_INVALID_LOCATION');
  const id = String(value.id || '');
  const name = String(value.name || '').trim().slice(0, 120);
  const address = String(value.address || '').trim().slice(0, 240);
  const landmark = String(value.landmark || '').trim().slice(0, 160);
  const phones = Array.isArray(value.phones) ? value.phones.map((phone) => String(phone || '').trim()).filter((phone) => /^\+?[0-9][0-9\s-]{6,18}$/.test(phone)).slice(0, 4) : [];
  const windows = normaliseWindows(value.windows);
  if (!ID.test(id) || !name || !address || !windows || !windows.length || typeof value.procedureAllowed !== 'boolean') throw new Error('CONSULTATION_POLICY_INVALID_LOCATION');
  return { id, name, address, landmark, phones, windows, procedureAllowed: value.procedureAllowed };
};

// Reads a stored policy document. Anything malformed falls back to the supplied
// defaults rather than half-applying an unsafe mix; the caller reports the source.
const normalisePolicy = (raw) => {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.locations) || !raw.locations.length) return DEFAULT_POLICY;
  try {
    const seen = new Set();
    const locations = raw.locations.map(normaliseLocation);
    for (const location of locations) {
      if (seen.has(location.id)) throw new Error('CONSULTATION_POLICY_DUPLICATE_LOCATION');
      seen.add(location.id);
    }
    const videoWindows = normaliseWindows(raw.videoWindows ?? DEFAULT_VIDEO_WINDOWS);
    if (!videoWindows || !videoWindows.length) throw new Error('CONSULTATION_POLICY_INVALID_VIDEO');
    const closedWeekdays = Array.isArray(raw.closedWeekdays) ? [...new Set(raw.closedWeekdays)] : DEFAULT_CLOSED_WEEKDAYS;
    if (closedWeekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || closedWeekdays.length > 7) throw new Error('CONSULTATION_POLICY_INVALID_CLOSURE');
    const lifetime = raw.proposalLifetimeHours ?? DEFAULT_PROPOSAL_LIFETIME_HOURS;
    if (!Number.isInteger(lifetime) || lifetime < 1 || lifetime > MAX_PROPOSAL_LIFETIME_HOURS) throw new Error('CONSULTATION_POLICY_INVALID_LIFETIME');
    const services = {};
    if (raw.services && typeof raw.services === 'object' && !Array.isArray(raw.services)) {
      for (const [id, kind] of Object.entries(raw.services)) {
        if (!/^[a-z][a-z0-9_-]{1,79}$/.test(id) || !['consultation', 'procedure'].includes(kind)) throw new Error('CONSULTATION_POLICY_INVALID_SERVICE');
        services[id] = kind;
      }
    }
    return {
      locations,
      videoWindows,
      closedWeekdays: closedWeekdays.sort((left, right) => left - right),
      proposalLifetimeHours: lifetime,
      services,
      source: 'stored',
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
      updatedBy: typeof raw.updatedBy === 'string' ? raw.updatedBy : null,
    };
  } catch {
    return DEFAULT_POLICY;
  }
};

const locationFor = (policy, locationId) => policy.locations.find((location) => location.id === locationId) || null;

// Validates the stored policy document submitted by an administrator.
const validatePolicyDocument = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('CONSULTATION_POLICY_INVALID');
  const allowed = ['locations', 'videoWindows', 'closedWeekdays', 'proposalLifetimeHours', 'services'];
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error('CONSULTATION_POLICY_INVALID');
  if (!Array.isArray(value.locations) || value.locations.length < 1 || value.locations.length > 6) throw new Error('CONSULTATION_POLICY_INVALID');
  const locations = value.locations.map(normaliseLocation);
  if (new Set(locations.map((location) => location.id)).size !== locations.length) throw new Error('CONSULTATION_POLICY_DUPLICATE_LOCATION');
  const videoWindows = normaliseWindows(value.videoWindows ?? DEFAULT_VIDEO_WINDOWS);
  if (!videoWindows || !videoWindows.length) throw new Error('CONSULTATION_POLICY_INVALID_VIDEO');
  const closedWeekdays = value.closedWeekdays ?? [0];
  if (!Array.isArray(closedWeekdays) || closedWeekdays.length > 7 || closedWeekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error('CONSULTATION_POLICY_INVALID_CLOSURE');
  const lifetime = value.proposalLifetimeHours ?? DEFAULT_PROPOSAL_LIFETIME_HOURS;
  if (!Number.isInteger(lifetime) || lifetime < 1 || lifetime > MAX_PROPOSAL_LIFETIME_HOURS) throw new Error('CONSULTATION_POLICY_INVALID_LIFETIME');
  const services = value.services ?? {};
  if (typeof services !== 'object' || Array.isArray(services)) throw new Error('CONSULTATION_POLICY_INVALID_SERVICE');
  for (const [id, kind] of Object.entries(services)) {
    if (!/^[a-z][a-z0-9_-]{1,79}$/.test(id) || !['consultation', 'procedure'].includes(kind)) throw new Error('CONSULTATION_POLICY_INVALID_SERVICE');
  }
  return {
    locations,
    videoWindows,
    closedWeekdays: [...new Set(closedWeekdays)].sort((left, right) => left - right),
    proposalLifetimeHours: lifetime,
    services: { ...services },
  };
};

const serviceKind = (policy, serviceId) => policy.services?.[serviceId] || 'consultation';

// The single refusal used by both the availability read and every write path.
const selectionRefusal = ({ policy, service, mode, locationId }) => {
  if (!service) return 'The selected appointment format is unavailable.';
  if (service.mode !== mode) return 'The selected appointment format does not match the consultation mode.';
  if (mode === 'video') {
    if (locationId) return 'Online consultations do not have a clinic location.';
    return null;
  }
  if (mode !== 'in_person') return 'Choose an in-person or online consultation.';
  const location = locationFor(policy, locationId);
  if (!location) return 'Choose a valid clinic location.';
  if (serviceKind(policy, service.id) === 'procedure' && !location.procedureAllowed) return 'Procedures are only performed at Dhawan Hospital. Please choose an in-person consultation at Jindal Diagnostics.';
  return null;
};

const windowsFor = ({ policy, mode, locationId, dateKey }) => {
  if (policy.closedWeekdays.includes(weekdayIst(dateKey))) return [];
  if (mode === 'video') return policy.videoWindows;
  const location = locationFor(policy, locationId);
  return location ? location.windows : [];
};

const overlaps = (start, end, busyStart, busyEnd) => start < busyEnd && end > busyStart;

/**
 * Slot generation for one doctor/day. All locations and video share this grid, so
 * an appointment/hold written by any one mode removes the overlapping time from
 * every other mode (capacity is per doctor, not per location).
 *
 * A slot is produced only when the whole appointment fits inside one permitted
 * window. Buffers are applied to the overlap check, never used to extend the
 * window, so a booking can sit at a window edge while still protecting its buffer.
 */
const buildSlots = ({
  doctorId,
  dateKey,
  mode,
  locationId,
  durationMinutes,
  policy,
  leadMinutes = 30,
  bookingWindowDays = 14,
  bufferBeforeMinutes = 0,
  bufferAfterMinutes = 0,
  busyRanges = [],
  now = new Date(),
}) => {
  if (!doctorId) throw new Error('A doctor is required.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) throw new Error('A valid appointment date is required.');
  if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 240) throw new Error('Invalid appointment duration.');
  if (![leadMinutes, bookingWindowDays, bufferBeforeMinutes, bufferAfterMinutes].every(Number.isFinite)) throw new Error('Invalid booking timing configuration.');

  const today = istDateKey(now);
  if (dateKey < today || dateKey > addIstDays(today, bookingWindowDays)) return [];
  const occupied = busyRanges
    .map((range) => {
      const start = new Date(range.startsAt).getTime();
      const end = new Date(range.endsAt).getTime();
      return Number.isFinite(start) && Number.isFinite(end) && start < end ? { start, end } : null;
    })
    .filter(Boolean);
  const leadBoundary = now.getTime() + leadMinutes * 60 * 1000;
  const seen = new Set();
  return windowsFor({ policy, mode, locationId, dateKey }).flatMap(({ start, end }) => {
    const result = [];
    const windowStart = minutesFor(start);
    const windowEnd = minutesFor(end);
    for (let cursor = windowStart; cursor + durationMinutes <= windowEnd; cursor += SLOT_MINUTES) {
      const time = timeFor(cursor);
      const startsAt = istInstant(dateKey, time);
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
      if (startsAt.getTime() < leadBoundary) continue;
      const bufferedStart = startsAt.getTime() - bufferBeforeMinutes * 60 * 1000;
      const bufferedEnd = endsAt.getTime() + bufferAfterMinutes * 60 * 1000;
      if (occupied.some((range) => overlaps(bufferedStart, bufferedEnd, range.start, range.end))) continue;
      const slotId = makeSlotId(doctorId, dateKey, time);
      if (seen.has(slotId)) continue;
      seen.add(slotId);
      result.push({ slotId, startsAt, endsAt, dateKey, time, mode, locationId: locationId || null, durationMinutes });
    }
    return result;
  });
};

// Every 30-minute unit an appointment/hold occupies, aligned to the slot grid.
const unitStarts = ({ startsAt, endsAt, slotMinutes = SLOT_MINUTES }) => {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) return [];
  const units = [];
  for (let at = start; at < end; at += slotMinutes * 60 * 1000) units.push(new Date(at));
  return units;
};

// Slot ids use IST wall-clock time, which is exactly UTC+05:30 with no DST.
const toIstMinutes = (date) => {
  const shifted = new Date(date.getTime() + (5 * 60 + 30) * 60 * 1000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
};
const unitSlotIds = ({ doctorId, dateKey, startsAt, endsAt }) => unitStarts({ startsAt, endsAt }).map((start) => {
  const minutes = toIstMinutes(start);
  return makeSlotId(doctorId, dateKey, `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);
});

const proposalExpiry = (createdAt, lifetimeHours = DEFAULT_PROPOSAL_LIFETIME_HOURS) => {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime()) || !Number.isInteger(lifetimeHours) || lifetimeHours < 1 || lifetimeHours > MAX_PROPOSAL_LIFETIME_HOURS) throw new Error('Invalid proposal lifetime.');
  return new Date(created.getTime() + lifetimeHours * 60 * 60 * 1000);
};

// Deterministic bulk order: submission time first, then document id.
const orderRequests = (rows) => [...rows].sort((left, right) => {
  const leftAt = left.createdAt?.toDate ? left.createdAt.toDate().getTime() : new Date(left.createdAt || 0).getTime();
  const rightAt = right.createdAt?.toDate ? right.createdAt.toDate().getTime() : new Date(right.createdAt || 0).getTime();
  return (Number.isFinite(leftAt) ? leftAt : 0) - (Number.isFinite(rightAt) ? rightAt : 0) || String(left.id).localeCompare(String(right.id));
});

const hashToken = (token) => require('node:crypto').createHash('sha256').update(String(token || '')).digest('hex');

module.exports = {
  SLOT_MINUTES,
  DEFAULT_POLICY,
  DEFAULT_PROPOSAL_LIFETIME_HOURS,
  MAX_PROPOSAL_LIFETIME_HOURS,
  buildSlots,
  hashToken,
  locationFor,
  minutesFor,
  normalisePolicy,
  orderRequests,
  overlaps,
  proposalExpiry,
  selectionRefusal,
  serviceKind,
  timeFor,
  unitSlotIds,
  unitStarts,
  validatePolicyDocument,
  windowsFor,
};
