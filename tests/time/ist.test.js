import { describe, expect, it } from 'vitest';
import { addIstDays, istDateKey, istInstant, startOfIstWeekMonday, toIstParts, weekdayIst } from '../../Frontend/src/lib/ist.js';
import functionIst from '../../functions/lib/ist.js';

describe('IST clinic-time helpers', () => {
  const boundaryInstant = new Date('2026-01-01T19:00:00.000Z');

  it('uses Asia/Kolkata instead of the browser or server timezone', () => {
    expect(toIstParts(boundaryInstant)).toMatchObject({ year: 2026, month: 1, day: 2, hour: 0, minute: 30 });
    expect(istDateKey(boundaryInstant)).toBe('2026-01-02');
    expect(functionIst.istDateKey(boundaryInstant)).toBe('2026-01-02');
  });

  it('turns an IST date and wall time into the correct instant', () => {
    expect(istInstant('2026-01-02', '00:30').toISOString()).toBe('2026-01-01T19:00:00.000Z');
    expect(functionIst.istInstant('2026-01-02', '00:30').toISOString()).toBe('2026-01-01T19:00:00.000Z');
  });

  it('calculates week boundaries and weekdays from IST calendar dates', () => {
    expect(weekdayIst('2026-01-05')).toBe(1);
    expect(addIstDays('2026-01-05', -1)).toBe('2026-01-04');
    expect(istDateKey(startOfIstWeekMonday(new Date('2026-01-07T12:00:00.000Z')))).toBe('2026-01-05');
  });
});
