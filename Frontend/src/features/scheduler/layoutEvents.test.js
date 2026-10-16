import { describe, expect, it } from 'vitest';
import { layoutEvents } from './layoutEvents.js';

const event = (id, start, end) => ({
  id,
  startsAt: `2026-10-12T${start}:00.000Z`,
  endsAt: `2026-10-12T${end}:00.000Z`,
});

describe('calendar event layout', () => {
  it('does not overlap touching events', () => {
    const result = layoutEvents([event('a', '08:00', '08:20'), event('b', '08:20', '08:40')]);
    expect(result.map(({ column, width }) => [column, width])).toEqual([[0, 1], [0, 1]]);
  });

  it('shares width for overlapping events and handles transitive clusters', () => {
    const result = layoutEvents([event('a', '08:00', '08:30'), event('b', '08:20', '08:50'), event('c', '08:40', '09:00')]);
    expect(result.map(({ width }) => width)).toEqual([0.5, 0.5, 0.5]);
    expect(new Set(result.map(({ column }) => column)).size).toBe(2);
  });

  it('keeps zero-duration events valid', () => {
    expect(layoutEvents([event('a', '08:00', '08:00')])[0].width).toBe(1);
  });
});
