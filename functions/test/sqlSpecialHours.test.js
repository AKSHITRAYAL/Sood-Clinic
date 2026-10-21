import { createRequire } from 'node:module';
import { expect, test, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { createHash } = require('node:crypto');
const { createSqlSpecialHours, sqlSpecialHoursCallableOptions } = require('../lib/sqlSpecialHours');

const legacyId = 'DOC-71';
const doctorRowId = 'b0000000-0000-4000-8000-000000000001';
const exceptionId = 'c0ffee00-0000-4000-8000-000000000001';
const invalidId = 'not-a-uuid';
const requestId = 'c0ffee00-0000-4000-8000-000000000001';
const updatedAt = '2026-10-20T04:00:00.000000Z';

function setup({ role = 'admin', claims, read, receipt, save } = {}) {
  const user = { uid: 'staff-actor', disabled: false, customClaims: claims ?? { role }, tokensValidAfterTime: null };
  const auth = { getUser: vi.fn(async () => user) };
  const store = {
    read: read ?? vi.fn(async () => ({
      user: { active: true },
      doctors: [{
        id: doctorRowId, legacyId, active: true, name: 'Synthetic Doctor',
        branch: { timezone: 'Asia/Kolkata' }, state: { authority: 'doctor_schedule', updatedAt: '2026-10-20T04:00:00Z' },
        exceptions: [],
      }],
    })),
    receipt: receipt ?? vi.fn(async () => null),
    save: save ?? vi.fn(async () => undefined),
  };
  const service = createSqlSpecialHours({ auth, store });
  const doctorToken = user.customClaims.doctorId ? { doctorId: user.customClaims.doctorId } : {};
  const request = data => ({
    auth: { uid: user.uid, token: { role: user.customClaims.role, auth_time: Math.floor(Date.now() / 1000), ...doctorToken } },
    data, app: { appId: 'synthetic-app' },
  });
  return { user, auth, store, service, request };
}

test('get returns only whitelisted fields or a null exception', async () => {
  const { store, service, request } = setup({
    read: vi.fn(async () => ({
      user: { active: true },
      doctors: [{
        id: doctorRowId, legacyId, active: true, name: 'Synthetic Doctor',
        branch: { timezone: 'Asia/Kolkata' }, state: { authority: 'doctor_schedule', updatedAt: '2026-10-20T04:00:00Z' },
        exceptions: [{
          id: exceptionId, doctorId, date: '2026-10-20', kind: 'extra',
          sessions: [{ startMinute: 540, endMinute: 660 }, { startMinute: 660, endMinute: 720 }],
        }],
      }],
    }),
  }),
  });
  const result = await service.get(request({ doctorId: legacyId, date: '2026-10-20' }));
  expect(Object.keys(result).sort()).toEqual(['date', 'doctorId', 'doctorName', 'exception', 'timezone', 'updatedAt'].sort());
  expect(result).toMatchObject({
    date: '2026-10-20', doctorId: legacyId, doctorName: 'Synthetic Doctor', timezone: 'Asia/Kolkata',
    updatedAt: '2026-10-20T04:00:00.000000Z',
    exception: { kind: 'extra', sessions: [{ startMinute: 540, endMinute: 660 }, { startMinute: 660, endMinute: 720 }] },
  });
  expect(JSON.stringify(result)).not.toMatch(/patient|phone|email/i);
  expect(store.read).toHaveBeenCalledWith({ actorUid: 'staff-actor', doctorId: legacyId, date: '2026-10-20' });
  expect(store.save).not.toHaveBeenCalled();
});

test('get returns a null exception with no sessions', async () => {
  const { store, service, request } = setup({
    read: vi.fn(async () => ({
      user: { active: true },
      doctors: [{
        id: doctorRowId, legacyId, active: true, name: 'Synthetic Doctor',
        branch: { timezone: 'Asia/Kolkata' }, state: { authority: 'doctor_schedule', updatedAt: '2026-10-20T04:00:00Z' },
        exceptions: [],
      }],
    }),
  }),
  });
  const result = await service.get(request({ doctorId: legacyId, date: '2026-10-20' }));
  expect(result.exception).toBe(null);
});

test('get fails closed on inactive accounts and malformed doctor/schedule rows', async () => {
  for (const { read, code } of [
    { read: async () => ({ user: { active: false }, doctors: [] }), code: 'permission-denied' },
    { read: async () => ({ user: { active: true }, doctors: [] }), code: 'failed-precondition' },
    { read: async () => ({ user: { active: true }, doctors: [{ id: doctorRowId, legacyId: 'DOC-72', active: true, name: 'Synthetic Doctor', branch: { timezone: 'Asia/Kolkata' }, state: { authority: 'doctor_schedule', updatedAt: '2026-10-20T04:00:00Z' }, exceptions: [] }] }), code: 'failed-precondition' },
    { read: async () => ({ user: { active: true }, doctors: [{ id: doctorRowId, legacyId, active: false, name: 'Synthetic Doctor', branch: { timezone: 'Asia/Kolkata' }, state: { authority: 'doctor_schedule', updatedAt: '2026-10-20T04:00:00Z' }, exceptions: [] }] }), code: 'failed-precondition' },
    { read: async () => ({ user: { active: true }, doctors: [{ id: doctorRowId, legacyId, active: true, name: 'Synthetic Doctor', branch: { timezone: 'UTC' }, state: { authority: 'doctor_schedule', updatedAt: '2026-10-20T04:00:00Z' }, exceptions: [] }] }), code: 'failed-precondition' },
    { read: async () => ({ user: { active: true }, doctors: [{ id: doctorRowId, legacyId, active: true, name: 'Synthetic Doctor', branch: { timezone: 'Asia/Kolkata' }, state: { authority: 'legacy_schedule', updatedAt: '2026-10-20T04:00:00Z' }, exceptions: [] }] }), code: 'failed-precondition' },
    { read: async () => ({ user: { active: true }, doctors: [{ id: doctorRowId, legacyId, active: true, name: 'Synthetic Doctor', branch: { timezone: 'Asia/Kolkata' }, state: { authority: 'doctor_schedule', updatedAt: 'bad' }, exceptions: [] }] }), code: 'failed-precondition' },
    { read: async () => ({ user: { active: true }, doctors: [{ id: doctorRowId, legacyId, active: true, name: '', branch: { timezone: 'Asia/Kolkata' }, state: { authority: 'doctor_schedule', updatedAt: '2026-10-20T04:00:00Z' }, exceptions: [] }] }), code: 'failed-precondition' },
    { read: async () => ({ user: { active: true }, doctors: [{ id: doctorRowId, legacyId, active: true, name: 'Dr\u0007', branch: { timezone: 'Asia/Kolkata' }, state: { authority: 'doctor_schedule', updatedAt: '2026-10-20T04:00:00Z' }, exceptions: [] }] }), code: 'failed-precondition' },
    { read: async () => ({ user: { active: true }, doctors: [{ id: 'not-a-uuid', legacyId, active: true, name: 'Synthetic Doctor', branch: { timezone: 'Asia/Kolkata' }, state: { authority: 'doctor_schedule', updatedAt: '2026-10-20T04:00:00Z' }, exceptions: [] }] }), code: 'failed-precondition' },
    { read: async () => ({ user: { active: true }, doctors: [{ id: doctorRowId, legacyId, active: true, name: 'Synthetic Doctor', branch: { timezone: 'Asia/Kolkata' }, state: { authority: 'doctor_schedule', updatedAt: '2026-10-20T04:00:00Z' }, exceptions: [{ id: exceptionId, doctorId, date: '2026-10-20', kind: 'invented' }] }] }), code: 'failed-precondition' },
    { read: async () => ({ user: { active: true }, doctors: [{ id: doctorRowId, legacyId, active: true, name: 'Synthetic Doctor', branch: { timezone: 'Asia/Kolkata' }, state: { authority: 'doctor_schedule', updatedAt: '2026-10-20T04:00:00Z' }, exceptions: [{ id: exceptionId, doctorId, date: '2026-10-20', kind: 'closed', sessions: [{ startMinute: 540, endMinute: 660 }] }] }] }), code: 'failed-precondition' },
    { read: async () => ({ user: { active: true }, doctors: [{ id: doctorRowId, legacyId, active: true, name: 'Synthetic Doctor', branch: { timezone: 'Asia/Kolkata' }, state: { authority: 'doctor_schedule', updatedAt: '2026-10-20T04:00:00Z' }, exceptions: [{ id: exceptionId, doctorId, date: '2026-10-20', kind: 'extra', sessions: [{ startMinute: 540, endMinute: 540 }] }] }] }), code: 'failed-precondition' },
    { read: async () => ({ user: { active: true }, doctors: [{ id: doctorRowId, legacyId, active: true, name: 'Synthetic Doctor', branch: { timezone: 'Asia/Kolkata' }, state: { authority: 'doctor_schedule', updatedAt: '2026-10-20T04:00:00Z' }, exceptions: [{ id: 'not-a-uuid', doctorId: '2026-10-20', date: '2026-10-20', kind: 'extra', sessions: [{ startMinute: 540, endMinute: 660 }] }] }] }), code: 'failed-precondition' },
    { read: async () => ({ user: { active: true }, doctors: [{ id: doctorRowId, legacyId, active: true, name: 'Synthetic Doctor', branch: { timezone: 'Asia/Kolkata' }, state: { authority: 'doctor_schedule', updatedAt: '2026-10-20T04:00:00Z' }, exceptions: [{ id: exceptionId, doctorId: '2026-10-20', date: '2026-10-20', kind: 'extra', sessions: [] }] }] }), code: 'failed-precondition' },
    { read: async () => { throw new Error('private SQL detail'); }), code: 'unavailable' },
  ]) {
    const { service, request } = setup({ read: vi.fn(read) });
    const failure = await service.get(request({ doctorId: legacyId, date: '2026-10-20' })).then(() => null, error => error);
    expect(failure).not.toBeNull();\n    expect(failure.code).toBe(code);\n    if (code === 'unavailable') expect(failure.message).not.toContain('private');\n  }\n});\n\ntest('app context, input shape, live role, scope and freshness gates run before SQL', async () => {\n  const { store, service, request } = setup();\n  const base = request({ doctorId: legacyId, date: '2026-10-20' });\n  for (const patch of [\n    { app: undefined }, { app: {} }, { app: { appId: '' } },\n    { app: { appId: 'synthetic-app', alreadyConsumed: true } },\n  ]) {\n    await expect(service.get({ ...base, ...patch })).rejects.toMatchObject({ code: 'failed-precondition' });\n  }\n  for (const data of [\n    { doctorId: legacyId, date: '2026-10-20', extra: 1 },\n    { doctorId: 'x', date: '2026-10-20' },\n    { doctorId: legacyId, date: '2026-10-3' },\n    { doctorId: legacyId, date: '2026-13-99' },\n    { doctorId: legacyId, date: '2026-02-30' },\n    { doctorId: legacyId },\n  ]) {\n    await expect(service.get(request(data))).rejects.toMatchObject({ code: 'invalid-argument' });\n  }\n  expect(store.read).not.toHaveBeenCalled();\n\n  const manager = setup({ role: 'manager' });\n  await expect(manager.service.get(manager.request({ doctorId: legacyId, date: '2026-10-20' }))).rejects.toMatchObject({ code: 'permission-denied' });\n  const patient = setup({ role: 'patient' });\n  await expect(patient.service.get(patient.request({ doctorId: legacyId, date: '2026-10-20' }))).rejects.toMatchObject({ code: 'permission-denied' });\n  const scoped = setup({ role: 'doctor', claims: { role: 'doctor', doctorId: 'DOC-72' } });\n  await expect(scoped.service.get(scoped.request({ doctorId: legacyId, date: '2026-10-20' }))).rejects.toMatchObject({ code: 'permission-denied' });\n  const disabled = setup();\n  disabled.user.disabled = true;\n  await expect(disabled.service.get(disabled.request({ doctorId: legacyId, date: '2026-10-20' }))).rejects.toMatchObject({ code: 'permission-denied' });\n  const forced = setup();\n  forced.user.customClaims = { role: 'admin', forcePasswordChange: true };\n  await expect(forced.service.get(forced.request({ doctorId: legacyId, date: '2026-10-20' }))).rejects.toMatchObject({ code: 'permission-denied' });\n  const future = setup();\n  const fresh = future.request({ doctorId: legacyId, date: '2026-10-20' });\n  fresh.auth.token.auth_time = Math.floor(Date.now() / 1000) + 600;\n  await expect(future.service.get(fresh)).rejects.toMatchObject({ code: 'permission-denied' });\n  expect(store.read).not.toHaveBeenCalled();\n\n  const own = setup({ role: 'doctor', claims: { role: 'doctor', doctorId: legacyId } });\n  await own.service.get(own.request({ doctorId: legacyId, date: '2026-10-20' }));\n  expect(own.store.read).toHaveBeenCalledTimes(1);\n});\n\ntest('get never trusts a malformed or unconfirmed response', async () => {\n  const bad = [\n    undefined, {},\n    { doctorId, date: '2026-10-20', timezone: 'Asia/Kolkata', updatedAt: updatedAt, doctorName: 'Synthetic Doctor', exception: null },\n    { doctorId: 'DOC-72', date: '2026-10-20', timezone: 'Asia/Kolkata', updatedAt: updatedAt, doctorName: 'Synthetic Doctor', exception: null },\n    { doctorId, date: '2026-10-21', timezone: 'Asia/Kolkata', updatedAt: updatedAt, doctorName: 'Synthetic Doctor', exception: null },\n    { doctorId, date, timezone: 'UTC', updatedAt: updatedAt, doctorName: 'Synthetic Doctor', exception: null },\n    { doctorId, date, timezone: 'Asia/Kolkata', updatedAt: 'bad', doctorName: 'Synthetic Doctor', exception: null },\n    { doctorId, date, timezone: 'Asia/Kolkata', updatedAt: updatedAt, doctorName: '', exception: null },\n    { doctorId, date, timezone: 'Asia/Kolkata', updatedAt: updatedAt, doctorName: 'Dr\\u0007', exception: null },\n    { doctorId, date, timezone: 'Asia/Kolkata', updatedAt: updatedAt, doctorName: 'Synthetic Doctor' },\n    { doctorId, date, timezone: 'Asia/Kolkata', updatedAt: updatedAt, doctorName: 'Synthetic Doctor', exception: { kind: 'invented' } },\n    { doctorId, date, timezone: 'Asia/Kolkata', updatedAt: updatedAt, doctorName: 'Synthetic Doctor', exception: { kind: 'extra', sessions: [{ startMinute: 540, endMinute: 540 }] } },\n    { doctorId, date, timezone: 'Asia/Kolkata', updatedAt: updatedAt, doctorName: 'Synthetic Doctor', exception: { kind: 'extra', sessions: [{ startMinute: 540, endMinute: 540 }] } },\n  ];\n  for (const data of bad) {\n    invoke.mockResolvedValue({ data });\n    await expect(service.get(request({ doctorId, date: '2026-10-20' }))).rejects.toThrow('Select a doctor/date and enter one to four valid special-hours sessions.');\n  }\n  expect(invoke).toHaveBeenCalledTimes(bad.length);\n  expect(names.filter(n => n === 'getSqlDoctorSpecialHours')).toHaveLength(bad.length);\n});
