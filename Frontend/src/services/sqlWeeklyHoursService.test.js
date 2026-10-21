import { beforeEach, expect, test, vi } from 'vitest';
const { invoke, names } = vi.hoisted(() => ({ invoke: vi.fn(), names: [] }));
vi.mock('firebase/functions', () => ({ httpsCallable: (_functions, name) => async payload => { names.push(name); return invoke(payload); } }));
vi.mock('../lib/firebase', () => ({ functions: {} }));
import { sqlWeeklyHoursService } from './sqlWeeklyHoursService';

const doctorId = 'DOC-71';
const updatedAt = '2026-10-20T04:00:00.000000Z';
const requestId = 'C0FFEE00-0000-4000-8000-000000000001';
const invalidMsg = 'Enter valid weekly hours and reload the current schedule before saving.';
const session = (weekday, startMinute, endMinute) => ({ weekday, startMinute, endMinute });
const envelope = patch => ({
  doctorLegacyId: doctorId, doctorName: 'Synthetic Doctor', timezone: 'Asia/Kolkata',
  updatedAt, sessions: [session(1, 540, 660)], ...patch,
});

beforeEach(() => { invoke.mockReset(); names.length = 0; });

test('get sends only doctorId and returns only whitelisted fields with sorted sessions', async () => {
  invoke.mockResolvedValue({ data: envelope({ doctorId: 'internal-row-id', internalNote: 'must-not-leak', sessions: [session(3, 60, 120), session(1, 540, 660)] }) });
  const result = await sqlWeeklyHoursService.get(doctorId);
  expect(names).toEqual(['getSqlDoctorWeeklyHours']);
  expect(invoke).toHaveBeenCalledWith({ doctorId });
  expect(result).toEqual({ doctorId, doctorName: 'Synthetic Doctor', timezone: 'Asia/Kolkata', updatedAt, sessions: [session(1, 540, 660), session(3, 60, 120)] });
  expect(JSON.stringify(result)).not.toMatch(/internal|patient|phone/i);
});

test('invalid get inputs fail before any callable work', async () => {
  for (const value of ['', 'x', 'has space', 'a'.repeat(81), 7, null, undefined]) {
    await expect(sqlWeeklyHoursService.get(value)).rejects.toThrow(invalidMsg);
  }
  expect(invoke).not.toHaveBeenCalled();
});

test('malformed get envelopes fail closed', async () => {
  for (const data of [
    { ...envelope(), doctorLegacyId: 'DOC-72' },
    { ...envelope(), timezone: 'UTC' },
    { ...envelope(), updatedAt: 'bad' },
    { ...envelope(), doctorName: '' },
    { ...envelope(), sessions: undefined },
    { ...envelope(), sessions: Array(15).fill(null).map((_, i) => session(i % 7, i * 2, i * 2 + 1)) },
    { ...envelope(), sessions: [session(7, 0, 60)] },
    { ...envelope(), sessions: [session(1, 660, 540)] },
    { ...envelope(), sessions: [session(1, 0, 1440)] },
    // unknown keys inside a session are stripped by design, not rejected
    { ...envelope(), sessions: [session(1, 540, 660), session(1, 600, 720)] },
  ]) {
    invoke.mockResolvedValue({ data });
    await expect(sqlWeeklyHoursService.get(doctorId)).rejects.toThrow(invalidMsg);
  }
});

test('save sends only the whitelisted payload and requires a confirmed save', async () => {
  invoke.mockResolvedValue({ data: { saved: true, receipt: 'must-not-leak' } });
  const result = await sqlWeeklyHoursService.save({
    doctorId, sessions: [session(3, 60, 120), session(1, 540, 660)],
    expectedUpdatedAt: updatedAt, requestId, internal: 'drop-me',
  });
  expect(result).toEqual({ saved: true });
  expect(names).toEqual(['saveSqlDoctorWeeklyHours']);
  expect(invoke).toHaveBeenCalledWith({ doctorId, sessions: [session(1, 540, 660), session(3, 60, 120)], expectedUpdatedAt: updatedAt, requestId });
  expect(JSON.stringify(invoke.mock.calls[0][0])).not.toMatch(/internal|receipt/i);
});

test('invalid save inputs fail before any callable work', async () => {
  const base = { doctorId, sessions: [session(1, 540, 660)], expectedUpdatedAt: updatedAt, requestId };
  for (const patch of [
    { doctorId: 'x' },
    { expectedUpdatedAt: 'bad' },
    { requestId: 'nope' },
    { sessions: Array(15).fill(null).map((_, i) => session(i % 7, i * 2, i * 2 + 1)) },
    { sessions: [session(1, 540, 660), session(1, 600, 720)] },
    // unknown keys inside a session are stripped by design, not rejected
    { sessions: 'none' },
    { sessions: [session(7, 0, 60)] },
    { sessions: [session(1, 660, 540)] },
    { sessions: [session(1, 0, 1440)] },
    { sessions: [session(1, 540, 660), session(1, 540, 660)] },
  ]) {
    await expect(sqlWeeklyHoursService.save({ ...base, ...patch })).rejects.toThrow(invalidMsg);
  }
  expect(invoke).not.toHaveBeenCalled();
});

test('an unconfirmed save response is never reported as success', async () => {
  for (const data of [{ saved: false }, {}, { saved: 'yes' }, undefined]) {
    invoke.mockResolvedValue({ data });
    await expect(sqlWeeklyHoursService.save({ doctorId, sessions: [session(1, 540, 660)], expectedUpdatedAt: updatedAt, requestId }))
      .rejects.toThrow('The weekly-hours save could not be confirmed. Reload before editing again.');
  }
  expect(names).toEqual(['saveSqlDoctorWeeklyHours', 'saveSqlDoctorWeeklyHours', 'saveSqlDoctorWeeklyHours', 'saveSqlDoctorWeeklyHours']);
});
