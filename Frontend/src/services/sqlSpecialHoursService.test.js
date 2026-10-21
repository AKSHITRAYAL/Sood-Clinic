import { beforeEach, expect, test, vi } from 'vitest';
const { invoke, names } = vi.hoisted(() => ({ invoke: vi.fn(), names: [] }));
vi.mock('firebase/functions', () => ({ httpsCallable: (_functions, name) => async payload => { names.push(name); return invoke(payload); } }));
vi.mock('../lib/firebase', () => ({ functions: {} }));
import { sqlSpecialHoursService } from './sqlSpecialHoursService';

const doctorId = 'DOC-71';
const date = '2026-10-20';
const updatedAt = '2026-10-20T04:00:00.000000Z';
const requestId = 'C0FFEE00-0000-4000-8000-000000000001';
const invalidMsg = 'Select a doctor/date and enter one to four valid special-hours sessions.';
const envelope = patch => ({ doctorId, date, timezone: 'Asia/Kolkata', updatedAt, doctorName: 'Synthetic Doctor', exception: null, ...patch });
const hour = (startMinute, endMinute) => ({ startMinute, endMinute });

beforeEach(() => { invoke.mockReset(); names.length = 0; });

test('get sends only doctorId and date and returns only whitelisted fields or a null exception', async () => {
  invoke.mockResolvedValue({ data: envelope({ exception: { kind: 'extra', sessions: [hour(540, 660), hour(660, 720)] } }) });
  const result = await sqlSpecialHoursService.get(doctorId, date);
  expect(names).toEqual(['getSqlDoctorSpecialHours']);
  expect(invoke).toHaveBeenCalledWith({ doctorId, date });
  expect(result).toEqual({ doctorId, date, doctorName: 'Synthetic Doctor', timezone: 'Asia/Kolkata', updatedAt, exception: { kind: 'extra', sessions: [hour(540, 660), hour(660, 720)] } });
  expect(JSON.stringify(result)).not.toMatch(/patient|phone/i);
});

test('invalid get inputs fail before any callable work', async () => {
  for (const args of [
    ['x', date], ['has space', date], ['a'.repeat(81), date], ['', date], ['', ''],
    [doctorId, '2026-10-3'], [doctorId, 'not-a-date'], [doctorId, '2027-13-01'],
  ]) {
    await expect(sqlSpecialHoursService.get(...args)).rejects.toThrow(invalidMsg);
  }
  expect(invoke).not.toHaveBeenCalled();
});

test('get fails closed on malformed or cross-scope envelopes', async () => {
  const rows = [
    { ...envelope(), doctorId: 'DOC-72' },
    { ...envelope(), date: '2026-10-21' },
    { ...envelope(), timezone: 'UTC' },
    { ...envelope(), updatedAt: 'bad' },
    { ...envelope(), doctorName: '' },
    { ...envelope(), doctorName: 'D'.repeat(161) },
    { ...envelope(), exception: undefined },
    { ...envelope(), exception: { kind: 'invented', sessions: [] } },
    { ...envelope(), exception: { kind: 'closed', sessions: [hour(540, 660)] } },
    { ...envelope(), exception: { kind: 'extra', sessions: 'x' } },
    { ...envelope(), exception: { kind: 'extra', sessions: [] } },
    { ...envelope(), exception: { kind: 'extra', sessions: [hour(540, 540)] } },
    { ...envelope(), exception: { kind: 'extra', sessions: [hour(660, 720), hour(540, 690)] } },
    { ...envelope(), exception: { kind: 'extra', sessions: [hour(540, 720), hour(600, 660)] } },
  ];
  for (const data of rows) {
    invoke.mockResolvedValue({ data });
    await expect(sqlSpecialHoursService.get(doctorId, date)).rejects.toThrow(invalidMsg);
  }
  expect(invoke).toHaveBeenCalledTimes(rows.length);
});

test('get passes a closed day through as a zero-session exception', async () => {
  invoke.mockResolvedValue({ data: envelope({ exception: { kind: 'closed', sessions: [] } }) });
  const result = await sqlSpecialHoursService.get(doctorId, date);
  expect(result.exception).toEqual({ kind: 'closed', sessions: [] });
});

test('save sends only the whitelisted payload and requires a confirmed save', async () => {
  invoke.mockResolvedValue({ data: { saved: true, receipt: 'must-not-leak' } });
  const result = await sqlSpecialHoursService.save({
    doctorId, date, kind: 'replace', sessions: [hour(660, 720), hour(540, 660)],
    expectedUpdatedAt: updatedAt, requestId, internal: 'drop-me',
  });
  expect(result).toEqual({ saved: true });
  expect(names).toEqual(['saveSqlDoctorSpecialHours']);
  expect(invoke).toHaveBeenCalledWith({ doctorId, date, kind: 'replace', sessions: [hour(540, 660), hour(660, 720)], expectedUpdatedAt: updatedAt, requestId });
  expect(JSON.stringify(invoke.mock.calls[0][0])).not.toMatch(/internal|receipt/i);
});

test('invalid save inputs fail before any callable work', async () => {
  const base = { doctorId, date, kind: 'extra', sessions: [hour(540, 660)], expectedUpdatedAt: updatedAt, requestId };
  for (const patch of [
    { doctorId: 'x' },
    { date: '2026-10-3' },
    { kind: 'closed' },
    { kind: undefined },
    { expectedUpdatedAt: 'bad' },
    { requestId: 'nope' },
    { sessions: 'none' },
    { sessions: [] },
    { sessions: [hour(540, 660), hour(600, 720), hour(720, 780), hour(780, 840), hour(840, 900)] },
    { sessions: [hour(600, 720), hour(540, 660)] },
    { sessions: [hour(540, 720), hour(600, 660)] },
    { sessions: [hour(540, 540)] },
    { sessions: [hour(-1, 60)] },
    { sessions: [hour(540, 1440)] },
    { sessions: [{ startMinute: 540.5, endMinute: 660 }] },
  ]) {
    await expect(sqlSpecialHoursService.save({ ...base, ...patch })).rejects.toThrow(invalidMsg);
  }
  expect(invoke).not.toHaveBeenCalled();
});

test('an unconfirmed save response is never reported as success', async () => {
  for (const data of [{ saved: false }, {}, { saved: 'yes' }, undefined]) {
    invoke.mockResolvedValue({ data });
    await expect(sqlSpecialHoursService.save({ doctorId, date, kind: 'extra', sessions: [hour(540, 660)], expectedUpdatedAt: updatedAt, requestId }))
      .rejects.toThrow('The special-hours save could not be confirmed. Reload before editing again.');
  }
  expect(names).toEqual(['saveSqlDoctorSpecialHours', 'saveSqlDoctorSpecialHours', 'saveSqlDoctorSpecialHours', 'saveSqlDoctorSpecialHours']);
});
