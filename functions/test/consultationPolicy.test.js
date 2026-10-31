import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  DEFAULT_POLICY,
  buildSlots,
  hashToken,
  normalisePolicy,
  orderRequests,
  proposalExpiry,
  selectionRefusal,
  serviceKind,
  unitSlotIds,
  unitStarts,
  validatePolicyDocument,
  windowsFor,
} = require('../lib/consultationPolicy');
const { istDateKey } = require('../lib/ist');

const DOCTOR = 'brig-ak-sood';
// Monday 2026-11-02; 2026-11-01 is a Sunday.
const MONDAY = '2026-11-02';
const NOW = new Date('2026-11-01T02:00:00.000Z');
const service = (overrides = {}) => ({ id: 'consultation', label: 'Consultation', minutes: 30, mode: 'in_person', active: true, ...overrides });
const times = (slots) => slots.map((slot) => slot.time);
const build = (overrides = {}) => buildSlots({
  doctorId: DOCTOR,
  dateKey: MONDAY,
  mode: 'in_person',
  locationId: 'dhawan-hospital',
  durationMinutes: 30,
  policy: DEFAULT_POLICY,
  leadMinutes: 0,
  bookingWindowDays: 30,
  now: NOW,
  ...overrides,
});

describe('consultation scheduling policy', () => {
  it('publishes the supplied location, video and Sunday-closure contract', () => {
    expect(DEFAULT_POLICY.locations.map((row) => [row.id, row.windows])).toEqual([
      ['dhawan-hospital', [{ start: '11:00', end: '15:00' }]],
      ['jindal-diagnostics', [{ start: '09:00', end: '11:00' }, { start: '17:00', end: '19:00' }]],
    ]);
    expect(DEFAULT_POLICY.videoWindows).toEqual([{ start: '09:30', end: '10:30' }, { start: '17:30', end: '18:30' }]);
    expect(DEFAULT_POLICY.closedWeekdays).toEqual([0]);
    expect(windowsFor({ policy: DEFAULT_POLICY, mode: 'video', dateKey: '2026-11-01' })).toEqual([]);
    expect(windowsFor({ policy: DEFAULT_POLICY, mode: 'video', dateKey: MONDAY })).toEqual(DEFAULT_POLICY.videoWindows);
  });

  it('generates a 30-minute grid that fits completely inside each window', () => {
    expect(times(build())).toEqual(['11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30']);
    expect(times(build({ locationId: 'jindal-diagnostics', leadMinutes: 0 })))
      .toEqual(['09:00', '09:30', '10:00', '10:30', '17:00', '17:30', '18:00', '18:30']);
    expect(times(build({ mode: 'video', locationId: null }))).toEqual(['09:30', '10:00', '17:30', '18:00']);
  });

  it('does not assume a procedure is one unit: a longer service consumes consecutive units', () => {
    expect(times(build({ durationMinutes: 60 }))).toEqual(['11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00']);
    // A 90-minute booking cannot start at 14:00 because it would run past 15:00.
    expect(times(build({ durationMinutes: 90 }))).toEqual(['11:00', '11:30', '12:00', '12:30', '13:00', '13:30']);
    expect(unitStarts({ startsAt: new Date('2026-11-02T05:30:00.000Z'), endsAt: new Date('2026-11-02T07:00:00.000Z') }))
      .toEqual([new Date('2026-11-02T05:30:00.000Z'), new Date('2026-11-02T06:00:00.000Z'), new Date('2026-11-02T06:30:00.000Z')]);
  });

  it('shares one doctor-capacity grid across every mode and location', () => {
    // A 09:30-10:30 video consultation occupies the same units as Jindal's 09:30 start.
    const videoUnits = unitSlotIds({
      doctorId: DOCTOR, dateKey: MONDAY,
      startsAt: new Date('2026-11-02T04:00:00.000Z'), endsAt: new Date('2026-11-02T05:00:00.000Z'),
    });
    expect(videoUnits).toEqual([
      `${DOCTOR}_20261102_0930`,
      `${DOCTOR}_20261102_1000`,
    ]);
    const jindal = build({ locationId: 'jindal-diagnostics', busyRanges: [{ startsAt: new Date('2026-11-02T04:00:00.000Z'), endsAt: new Date('2026-11-02T05:00:00.000Z') }] });
    expect(times(jindal)).not.toContain('09:30');
    expect(times(jindal)).not.toContain('10:00');
    expect(times(jindal)).toContain('10:30');
  });

  it('applies buffers to overlap checks without extending the window', () => {
    const busyRanges = [{ startsAt: new Date('2026-11-02T06:30:00.000Z'), endsAt: new Date('2026-11-02T07:00:00.000Z') }]; // 12:00-12:30 IST
    const buffered = build({ busyRanges, bufferBeforeMinutes: 15, bufferAfterMinutes: 15 });
    expect(times(buffered)).not.toContain('11:30');
    expect(times(buffered)).not.toContain('12:00');
    expect(times(buffered)).not.toContain('12:30');
    // 11:00 is an hour away from the busy block and stays available.
    expect(times(buffered)).toContain('11:00');
    // Buffers do not prevent a booking from ending exactly at the window edge.
    expect(times(buffered)).toContain('14:30');
  });

  it('refuses procedures at Jindal Diagnostics and any location for video', () => {
    const procedure = service({ id: 'endoscopy', minutes: 60 });
    const classified = { ...DEFAULT_POLICY, services: { endoscopy: 'procedure' } };
    expect(selectionRefusal({ policy: classified, service: procedure, mode: 'in_person', locationId: 'jindal-diagnostics' }))
      .toMatch(/Procedures are only performed at Dhawan Hospital/);
    expect(selectionRefusal({ policy: classified, service: procedure, mode: 'in_person', locationId: 'dhawan-hospital' })).toBeNull();
    expect(selectionRefusal({ policy: DEFAULT_POLICY, service: service({ mode: 'video' }), mode: 'video', locationId: 'dhawan-hospital' }))
      .toMatch(/do not have a clinic location/);
    expect(serviceKind({ services: { endoscopy: 'procedure' } }, 'endoscopy')).toBe('procedure');
    expect(serviceKind(DEFAULT_POLICY, 'consultation')).toBe('consultation');
  });

  it('keeps Sunday closure and proposal lifetime configurable, not hard-coded', () => {
    const stored = normalisePolicy({
      locations: DEFAULT_POLICY.locations,
      videoWindows: DEFAULT_POLICY.videoWindows,
      closedWeekdays: [0, 1],
      proposalLifetimeHours: 48,
      services: { endoscopy: 'procedure' },
    });
    expect(stored.source).toBe('stored');
    expect(stored.closedWeekdays).toEqual([0, 1]);
    expect(stored.proposalLifetimeHours).toBe(48);
    expect(times(build({ policy: stored }))).toEqual([]);
    expect(proposalExpiry('2026-11-02T00:00:00.000Z', 48).toISOString()).toBe('2026-11-04T00:00:00.000Z');
    expect(proposalExpiry('2026-11-02T00:00:00.000Z').toISOString()).toBe('2026-11-03T00:00:00.000Z');
  });

  it('rejects malformed policy documents and falls back to defaults on a bad read', () => {
    const base = {
      locations: DEFAULT_POLICY.locations,
      videoWindows: DEFAULT_POLICY.videoWindows,
      closedWeekdays: [0],
      proposalLifetimeHours: 24,
      services: {},
    };
    expect(() => validatePolicyDocument({ ...base, locations: [] })).toThrow();
    expect(() => validatePolicyDocument({ ...base, duplicate: true })).toThrow();
    expect(() => validatePolicyDocument({ ...base, closedWeekdays: [7] })).toThrow();
    expect(() => validatePolicyDocument({ ...base, proposalLifetimeHours: 0 })).toThrow();
    expect(() => validatePolicyDocument({ ...base, services: { endoscopy: 'surgery' } })).toThrow();
    expect(validatePolicyDocument(base).closedWeekdays).toEqual([0]);
    expect(normalisePolicy({ locations: 'not-a-list' })).toBe(DEFAULT_POLICY);
    expect(hashToken('token')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('orders a bulk approval deterministically by submission time then id', () => {
    const rows = [
      { id: 'b', createdAt: '2026-11-02T00:00:01.000Z' },
      { id: 'a', createdAt: '2026-11-02T00:00:01.000Z' },
      { id: 'c', createdAt: '2026-11-02T00:00:00.000Z' },
    ];
    expect(orderRequests(rows).map((row) => row.id)).toEqual(['c', 'a', 'b']);
    expect(istDateKey(new Date('2026-11-01T18:29:00.000Z'))).toBe('2026-11-01');
  });
});
