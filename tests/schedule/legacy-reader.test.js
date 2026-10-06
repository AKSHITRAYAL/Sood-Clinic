import { describe, expect, it } from 'vitest';
import { normalizeException, normalizeSchedule, sessionsForWeekday, sessionsFromWeekly, weeklyFromSessions } from '../../Frontend/src/lib/schedule.js';

describe('schedule migration helpers', () => {
  it('reads the legacy nested-window schedule shape', () => {
    const sessions = normalizeSchedule({ weekly: { 1: { enabled: true, windows: [['08:00', '10:00']] } } });
    expect(sessions).toEqual([{ weekday: 1, start: '08:00', end: '10:00' }]);
    expect(sessionsForWeekday(sessions, 1)).toEqual([{ start: '08:00', end: '10:00' }]);
  });

  it('writes and reads the Firestore-safe session-object shape', () => {
    const weekly = { 0: { enabled: false, windows: [] }, 1: { enabled: true, windows: [['08:00', '10:00']] } };
    const sessions = sessionsFromWeekly(weekly);
    expect(sessions).toEqual([{ weekday: 1, start: '08:00', end: '10:00' }]);
    expect(weeklyFromSessions(sessions, weekly)[1]).toEqual({ enabled: true, windows: [['08:00', '10:00']] });
  });

  it('normalizes legacy closures and new exception objects', () => {
    expect(normalizeException({ status: 'unavailable', windows: [] })).toEqual({ type: 'closed', sessions: [] });
    expect(normalizeException({ type: 'extra', sessions: [{ start: '17:00', end: '18:30' }] })).toEqual({ type: 'extra', sessions: [{ start: '17:00', end: '18:30' }] });
  });
});
