const { addIstDays, istDateKey, istInstant, weekdayIst } = require('../ist');
const { unitIdsForRange } = require('./units');
const { asMillis } = require('./placement');

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

const minutesFor = (value) => {
  if (!TIME.test(value || '')) return NaN;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
};

const timeFor = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const validSessions = (sessions, includeWeekday = false) => (Array.isArray(sessions) ? sessions : [])
  .filter((session) => session && TIME.test(session.start) && TIME.test(session.end)
    && minutesFor(session.start) < minutesFor(session.end)
    && (!includeWeekday || Number.isInteger(session.weekday)));

const mergeWindows = (sessions) => {
  const sorted = sessions
    .map(({ start, end }) => ({ start: minutesFor(start), end: minutesFor(end) }))
    .filter(({ start, end }) => Number.isFinite(start) && end > start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
  return sorted.reduce((merged, window) => {
    const previous = merged.at(-1);
    if (previous && window.start <= previous.end) {
      previous.end = Math.max(previous.end, window.end);
    } else {
      merged.push({ ...window });
    }
    return merged;
  }, []);
};

const windowsForDate = ({ dateKey, weeklySessions, exception }) => {
  const weekday = weekdayIst(dateKey);
  const regular = validSessions(weeklySessions, true)
    .filter((session) => session.weekday === weekday)
    .map(({ start, end }) => ({ start, end }));
  const exceptional = validSessions(exception?.sessions).map(({ start, end }) => ({ start, end }));
  if (exception?.type === 'closed') return [];
  if (exception?.type === 'replace') return mergeWindows(exceptional);
  return mergeWindows(exception?.type === 'extra' ? [...regular, ...exceptional] : regular);
};

const overlaps = (start, end, busyStart, busyEnd) => start < busyEnd && end > busyStart;

const computeDaySlots = ({
  dateKey,
  now,
  doctorId,
  visitType,
  weeklySessions,
  exception = null,
  blocks = [],
  occupiedUnitIds = new Set(),
  activeCountForType = 0,
}) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('dateKey must use YYYY-MM-DD.');
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error('now must be a valid Date.');
  const {
    minutes,
    bufferBeforeMinutes = 0,
    bufferAfterMinutes = 0,
    minNoticeMinutes = 0,
    maxAdvanceDays = 180,
    intervalMinutes = minutes,
    dailyLimit = null,
  } = visitType || {};
  if (![minutes, bufferBeforeMinutes, bufferAfterMinutes, minNoticeMinutes, maxAdvanceDays, intervalMinutes].every(Number.isFinite)
    || minutes < 5 || intervalMinutes < 5) throw new Error('Invalid visit type timing.');
  if (dailyLimit !== null && activeCountForType >= dailyLimit) return [];

  const today = istDateKey(now);
  if (dateKey < today || dateKey > addIstDays(today, maxAdvanceDays)) return [];
  const noticeBoundary = now.getTime() + minNoticeMinutes * 60 * 1000;
  const busyBlocks = blocks
    .map((block) => ({ start: new Date(block.startsAt).getTime(), end: new Date(block.endsAt).getTime() }))
    .filter(({ start, end }) => Number.isFinite(start) && Number.isFinite(end) && start < end);

  const slots = [];
  for (const window of windowsForDate({ dateKey, weeklySessions, exception })) {
    for (let cursor = window.start; cursor + minutes <= window.end; cursor += intervalMinutes) {
      const time = timeFor(cursor);
      const startsAt = istInstant(dateKey, time);
      const endsAt = new Date(startsAt.getTime() + minutes * 60 * 1000);
      const occupiedStart = new Date(startsAt.getTime() - bufferBeforeMinutes * 60 * 1000);
      const occupiedEnd = new Date(endsAt.getTime() + bufferAfterMinutes * 60 * 1000);
      if (startsAt.getTime() < noticeBoundary) continue;
      if (busyBlocks.some((block) => overlaps(occupiedStart.getTime(), occupiedEnd.getTime(), block.start, block.end))) continue;
      const unitIds = unitIdsForRange(doctorId || visitType.doctorId || '__unknown__', occupiedStart, occupiedEnd);
      const occupied = doctorId || visitType.doctorId
        ? unitIds.some((unitId) => occupiedUnitIds.has(unitId))
        : unitIds.some((unitId) => {
          const suffix = unitId.slice(unitId.indexOf('_') + 1);
          return [...occupiedUnitIds].some((occupiedUnitId) => occupiedUnitId.endsWith(`_${suffix}`));
        });
      if (occupied) continue;
      slots.push({ startsAt, endsAt, time });
    }
  }
  return slots.sort((left, right) => left.startsAt - right.startsAt);
};

/**
 * Every IST date key of `month`, plus whether the month can be booked at all. A month that
 * has already passed, or that opens after the last day inside the booking window, is
 * refused; days of a bookable month that fall outside the window are kept, because the
 * calendar still renders the whole month and `computeDaySlots` reports them as empty.
 */
const monthDateKeys = ({ month, today, maxAdvanceDays = null }) => {
  if (!MONTH.test(month || '') || !/^\d{4}-\d{2}-\d{2}$/.test(today || '')) return { ok: false, reason: 'VALIDATION' };
  const dates = [];
  for (let dateKey = `${month}-01`; dateKey.startsWith(`${month}-`); dateKey = addIstDays(dateKey, 1)) dates.push(dateKey);
  if (month < today.slice(0, 7)) return { ok: false, reason: 'OUTSIDE_WINDOW' };
  if (Number.isInteger(maxAdvanceDays) && dates[0] > addIstDays(today, maxAdvanceDays)) return { ok: false, reason: 'OUTSIDE_WINDOW' };
  return { ok: true, dates };
};

/**
 * Groups a month's slot documents by IST date and turns each group into the set of busy
 * five-minute unit ids. Expired holds are ignored, and a legacy single-range document is
 * expanded to the units it covers, so both shapes block a day.
 */
const groupUnitsByDate = (units, { now }) => {
  const byDate = new Map();
  // SQL rows are always single aligned five-minute units (unitKey), never legacy
  // range documents, so no expansion path is needed; expired holds never block.
  (Array.isArray(units) ? units : []).forEach((unit) => {
    if (!unit?.unitKey || !unit.unitAt) return;
    if (unit.kind === 'hold' && unit.expiresAt && asMillis(unit.expiresAt) <= now.getTime()) return;
    const dateKey = istDateKey(unit.unitAt);
    const busy = byDate.get(dateKey) || new Set();
    busy.add(unit.unitKey);
    byDate.set(dateKey, busy);
  });
  return byDate;
};

/**
 * Buckets busy ranges (clinic blocks and external calendar busy time) into the IST dates
 * they touch, so a day is only tested against its own ranges. A range that ends exactly at
 * IST midnight belongs to the earlier day.
 */
const groupRangesByDate = (ranges, dates) => {
  const known = new Set(Array.isArray(dates) ? dates : []);
  const byDate = new Map();
  (Array.isArray(ranges) ? ranges : []).forEach(({ startsAt, endsAt } = {}) => {
    if (!(startsAt instanceof Date) || !(endsAt instanceof Date) || endsAt <= startsAt) return;
    const last = istDateKey(new Date(endsAt.getTime() - 1));
    for (let dateKey = istDateKey(startsAt); ; dateKey = addIstDays(dateKey, 1)) {
      if (known.has(dateKey)) byDate.set(dateKey, [...(byDate.get(dateKey) || []), { startsAt, endsAt }]);
      if (dateKey >= last) break;
    }
  });
  return byDate;
};

module.exports = { computeDaySlots, groupRangesByDate, groupUnitsByDate, mergeWindows, minutesFor, monthDateKeys, timeFor, validSessions, windowsForDate };
