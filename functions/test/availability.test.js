import { describe, expect, it } from 'vitest';
import availability from '../lib/availability.js';

const { buildAvailability, makeSlotId } = availability;

const weekly = [
  { weekday: 1, start: '08:00', end: '10:00' },
  { weekday: 1, start: '17:00', end: '18:00' },
];
const base = {
  doctorId: 'doctor-one',
  dateKey: '2026-10-12', // Monday in IST
  weeklySessions: weekly,
  durationMinutes: 20,
  intervalMinutes: 20,
  leadMinutes: 0,
  bookingWindowDays: 30,
  now: new Date('2026-10-01T00:00:00.000Z'),
};

describe('appointment availability engine', () => {
  it('derives canonical IST slots only within weekly clinic sessions', () => {
    const slots = buildAvailability(base);
    expect(slots.map((slot) => slot.time)).toEqual(['08:00', '08:20', '08:40', '09:00', '09:20', '09:40', '17:00', '17:20', '17:40']);
    expect(slots[0].slotId).toBe(makeSlotId('doctor-one', '2026-10-12', '08:00'));
    expect(slots[0].startsAt.toISOString()).toBe('2026-10-12T02:30:00.000Z');
  });

  it('merges blocked slots and external busy periods before exposing availability', () => {
    const slots = buildAvailability({
      ...base,
      busyRanges: [
        { startsAt: '2026-10-12T03:10:00.000Z', endsAt: '2026-10-12T03:50:00.000Z' },
        { startsAt: '2026-10-12T11:30:00.000Z', endsAt: '2026-10-12T11:50:00.000Z' },
      ],
    });
    expect(slots.map((slot) => slot.time)).toEqual(['08:00', '08:20', '09:20', '09:40', '17:20', '17:40']);
  });

  it('gives closed and replace exceptions precedence over recurring hours', () => {
    expect(buildAvailability({ ...base, exception: { type: 'closed', sessions: [] } })).toHaveLength(0);
    expect(buildAvailability({ ...base, exception: { type: 'replace', sessions: [{ start: '12:00', end: '12:40' }] } }).map((slot) => slot.time)).toEqual(['12:00', '12:20']);
  });

  it('respects the clinic booking window and lead time', () => {
    expect(buildAvailability({ ...base, dateKey: '2026-11-15' })).toHaveLength(0);
    const today = buildAvailability({ ...base, dateKey: '2026-10-12', now: new Date('2026-10-12T02:45:00.000Z'), leadMinutes: 30 });
    expect(today.map((slot) => slot.time)).toEqual(['09:00', '09:20', '09:40', '17:00', '17:20', '17:40']);
  });
});
