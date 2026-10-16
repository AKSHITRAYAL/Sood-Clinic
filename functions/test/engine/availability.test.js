import { describe, expect, it } from 'vitest';
import { istInstant } from '../../lib/ist.js';
import { computeDaySlots, groupRangesByDate, groupUnitsByDate, monthDateKeys } from '../../lib/engine/availability.js';

const base = {
  dateKey: '2026-10-12',
  doctorId: 'doc',
  now: new Date('2026-10-01T00:00:00.000Z'),
  visitType: {
    minutes: 20,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minNoticeMinutes: 0,
    maxAdvanceDays: 30,
    intervalMinutes: 20,
    dailyLimit: null,
    doctorId: 'doc',
  },
  weeklySessions: [{ weekday: 1, start: '08:00', end: '10:00' }],
};

describe('scheduler availability engine', () => {
  it('generates aligned slots through the end of a session', () => {
    expect(computeDaySlots(base).map((slot) => slot.time)).toEqual(['08:00', '08:20', '08:40', '09:00', '09:20', '09:40']);
  });

  it('rejects occupied buffered units and blocks', () => {
    const occupied = new Set(['doc_202610120820', 'doc_202610120825', 'doc_202610120830', 'doc_202610120835', 'doc_202610120840', 'doc_202610120845']);
    const slots = computeDaySlots({
      ...base,
      visitType: { ...base.visitType, bufferAfterMinutes: 10 },
      occupiedUnitIds: occupied,
    });
    expect(slots.map((slot) => slot.time)).toEqual(['09:00', '09:20', '09:40']);
    expect(computeDaySlots({
      ...base,
      blocks: [{ startsAt: istInstant('2026-10-12', '09:00'), endsAt: istInstant('2026-10-12', '09:30') }],
    }).map((slot) => slot.time)).toEqual(['08:00', '08:20', '08:40', '09:40']);
  });

  it('applies notice, exceptions, limits and the advance window', () => {
    expect(computeDaySlots({ ...base, now: new Date('2026-10-12T02:20:00.000Z'), visitType: { ...base.visitType, minNoticeMinutes: 30 } }).map((slot) => slot.time))
      .toEqual(['08:20', '08:40', '09:00', '09:20', '09:40']);
    expect(computeDaySlots({ ...base, exception: { type: 'closed', sessions: [] } })).toEqual([]);
    expect(computeDaySlots({ ...base, exception: { type: 'replace', sessions: [{ start: '12:00', end: '12:40' }] } }).map((slot) => slot.time)).toEqual(['12:00', '12:20']);
    expect(computeDaySlots({ ...base, dateKey: '2026-11-15' })).toEqual([]);
    expect(computeDaySlots({ ...base, visitType: { ...base.visitType, dailyLimit: 1 }, activeCountForType: 1 })).toEqual([]);
  });

  it('honours every weekly window of the day at the visit interval', () => {
    const slots = computeDaySlots({
      ...base,
      weeklySessions: [
        { weekday: 1, start: '08:00', end: '10:00' },
        { weekday: 1, start: '17:00', end: '18:00' },
      ],
    });
    expect(slots.map((slot) => slot.time)).toEqual(['08:00', '08:20', '08:40', '09:00', '09:20', '09:40', '17:00', '17:20', '17:40']);
    expect(slots[0].startsAt.toISOString()).toBe('2026-10-12T02:30:00.000Z');
    expect(slots[0].endsAt.toISOString()).toBe('2026-10-12T02:50:00.000Z');
  });

  it('removes slots covered by clinic blocks and external busy periods', () => {
    const slots = computeDaySlots({
      ...base,
      weeklySessions: [
        { weekday: 1, start: '08:00', end: '10:00' },
        { weekday: 1, start: '17:00', end: '18:00' },
      ],
      blocks: [
        { startsAt: '2026-10-12T03:10:00.000Z', endsAt: '2026-10-12T03:50:00.000Z' },
        { startsAt: '2026-10-12T11:30:00.000Z', endsAt: '2026-10-12T11:50:00.000Z' },
      ],
    });
    expect(slots.map((slot) => slot.time)).toEqual(['08:00', '08:20', '09:20', '09:40', '17:20', '17:40']);
  });

  it('merges touching extra windows and orders slots', () => {
    const slots = computeDaySlots({
      ...base,
      dateKey: '2026-10-11',
      weeklySessions: [],
      exception: {
        type: 'extra',
        sessions: [{ start: '10:00', end: '10:20' }, { start: '10:20', end: '11:00' }],
      },
    });
    expect(slots.map((slot) => slot.time)).toEqual(['10:00', '10:20', '10:40']);
  });
});

describe('month availability helpers', () => {
  it('lists every IST date of a month, including short ones', () => {
    const october = monthDateKeys({ month: '2026-10', today: '2026-10-15', maxAdvanceDays: 30 });
    expect(october.ok).toBe(true);
    expect(october.dates).toHaveLength(31);
    expect(october.dates[0]).toBe('2026-10-01');
    expect(october.dates.at(-1)).toBe('2026-10-31');
    expect(monthDateKeys({ month: '2027-02', today: '2027-02-01' }).dates).toHaveLength(28);
    expect(monthDateKeys({ month: '2028-02', today: '2028-02-01' }).dates).toHaveLength(29);
  });

  it('refuses a malformed, past or out-of-window month', () => {
    expect(monthDateKeys({ month: '2026-13', today: '2026-10-15' })).toEqual({ ok: false, reason: 'VALIDATION' });
    expect(monthDateKeys({ month: '26-10', today: '2026-10-15' }).reason).toBe('VALIDATION');
    expect(monthDateKeys({ month: '2026-09', today: '2026-10-15' }).reason).toBe('OUTSIDE_WINDOW');
    expect(monthDateKeys({ month: '2026-12', today: '2026-10-15', maxAdvanceDays: 14 }).reason).toBe('OUTSIDE_WINDOW');
  });

  it('keeps a partly bookable month, so the calendar can still render it', () => {
    const days = monthDateKeys({ month: '2026-10', today: '2026-10-20', maxAdvanceDays: 5 });
    expect(days.ok).toBe(true);
    expect(days.dates).toHaveLength(31);
  });

  it('groups units by IST date and drops expired holds', () => {
    const now = istInstant('2026-10-12', '07:00');
    const grouped = groupUnitsByDate([
      { id: 'doc_202610120900', dateKey: '2026-10-12', kind: 'core' },
      { id: 'doc_202610120905', dateKey: '2026-10-12', kind: 'buffer' },
      { id: 'doc_202610130900', dateKey: '2026-10-13', kind: 'core' },
      { id: 'hold-1', dateKey: '2026-10-12', kind: 'hold', expiresAt: istInstant('2026-10-12', '06:59') },
      { id: 'hold-2', dateKey: '2026-10-12', kind: 'hold', expiresAt: istInstant('2026-10-12', '07:05') },
      { id: 'legacy', dateKey: '2026-10-12', kind: null,
        startsAt: istInstant('2026-10-12', '08:20'), endsAt: istInstant('2026-10-12', '08:40') },
    ], { now, doctorId: 'doc' });
    expect([...grouped.get('2026-10-12')].sort()).toEqual([
      'doc_202610120900', 'doc_202610120905', 'doc_202610120820', 'doc_202610120825',
      'doc_202610120830', 'doc_202610120835', 'hold-2',
    ].sort());
    expect([...grouped.get('2026-10-13')]).toEqual(['doc_202610130900']);
  });

  it('buckets busy ranges into the IST dates they touch', () => {
    const dates = ['2026-10-11', '2026-10-12', '2026-10-13'];
    const grouped = groupRangesByDate([
      { startsAt: istInstant('2026-10-12', '08:00'), endsAt: istInstant('2026-10-12', '08:40') },
      { startsAt: istInstant('2026-10-12', '22:00'), endsAt: istInstant('2026-10-13', '02:00') },
      { startsAt: istInstant('2026-10-12', '20:00'), endsAt: istInstant('2026-10-13', '00:00') },
      { startsAt: istInstant('2026-10-20', '08:00'), endsAt: istInstant('2026-10-20', '09:00') },
      { startsAt: istInstant('2026-10-12', '09:00'), endsAt: istInstant('2026-10-12', '09:00') },
    ], dates);
    expect(grouped.get('2026-10-12')).toHaveLength(3);
    expect(grouped.get('2026-10-13')).toHaveLength(1);
    expect(grouped.get('2026-10-11')).toBeUndefined();
  });
});
