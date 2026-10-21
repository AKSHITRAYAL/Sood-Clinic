import { createRequire } from 'node:module';
import { expect, test, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { createHash } = require('node:crypto');
const { createSqlWeeklyHours, sqlWeeklyHoursCallableOptions } = require('../lib/sqlWeeklyHours');

const legacyId = 'DOC-71';
const doctorRowId = 'b0000000-0000-4000-8000-000000000001';
const updatedAt = '2026-10-20T04:00:00.000000Z';
const requestId = 'C0FFEE00-0000-4000-8000-000000000001';
const session = (weekday, startMinute, endMinute) => ({ weekday, startMinute, endMinute });
const raw = doctorPatch => ({
  user: { active: true },
  doctors: [{
    id: doctorRowId, legacyId, active: true, name: 'Synthetic Doctor',
    branch: { timezone: 'Asia/Kolkata' },
    state: { authority: 'doctor_schedule', updatedAt: '2026-10-20T04:00:00Z' },
    sessions: [session(1, 540, 660)], ...doctorPatch,
  }],
});

function setup({ role = 'admin', claims, read, receipt, save } = {}) {
  const user = { uid: 'staff-actor', disabled: false, customClaims: claims ?? { role }, tokensValidAfterTime: null };
  const auth = { getUser: vi.fn(async () => user) };
  const store = {
    read: read ?? vi.fn(async () => raw()),
    receipt: receipt ?? vi.fn(async () => null),
    save: save ?? vi.fn(async () => undefined),
  };
  const service = createSqlWeeklyHours({ auth, store });
  const doctorToken = user.customClaims.doctorId ? { doctorId: user.customClaims.doctorId } : {};
  const request = data => ({
    auth: { uid: user.uid, token: { role: user.customClaims.role, auth_time: Math.floor(Date.now() / 1000), ...doctorToken } },
    data, app: { appId: 'synthetic-app' },
  });
  return { user, auth, store, service, request };
}

const saveInput = patch => ({
  doctorId: legacyId, sessions: [session(1, 540, 660)], expectedUpdatedAt: updatedAt, requestId, ...patch,
});

test('get returns only whitelisted fields with sorted, validated sessions', async () => {
  const { store, service, request } = setup({ read: vi.fn(async () => raw({ sessions: [session(3, 60, 120), session(1, 540, 660)] })) });
  const result = await service.get(request({ doctorId: legacyId }));
  expect(Object.keys(result).sort()).toEqual(['doctorLegacyId', 'doctorName', 'sessions', 'timezone', 'updatedAt'].sort());
  expect(result).toMatchObject({ doctorLegacyId: legacyId, doctorName: 'Synthetic Doctor', timezone: 'Asia/Kolkata', updatedAt });
  expect(result.sessions).toEqual([session(1, 540, 660), session(3, 60, 120)]);
  expect(JSON.stringify(result)).not.toMatch(/patient|phone|email/i);
  expect(store.read).toHaveBeenCalledWith({ actorUid: 'staff-actor', doctorId: legacyId });
  expect(store.save).not.toHaveBeenCalled();
});

test('app context, input shape, live role, scope and freshness gates run before SQL', async () => {
  const { store, service, request } = setup();
  const base = request({ doctorId: legacyId });
  for (const patch of [
    { app: undefined }, { app: {} }, { app: { appId: '' } },
    { app: { appId: 'synthetic-app', alreadyConsumed: true } },
  ]) {
    await expect(service.get({ ...base, ...patch })).rejects.toMatchObject({ code: 'failed-precondition' });
  }
  for (const data of [{ doctorId: legacyId, extra: 1 }, { doctorId: 'x' }, { doctorId: 7 }, {}]) {
    await expect(service.get(request(data))).rejects.toMatchObject({ code: 'invalid-argument' });
  }
  expect(store.read).not.toHaveBeenCalled();

  const manager = setup({ role: 'manager' });
  await expect(manager.service.get(manager.request({ doctorId: legacyId }))).rejects.toMatchObject({ code: 'permission-denied' });
  const patient = setup({ role: 'patient' });
  await expect(patient.service.get(patient.request({ doctorId: legacyId }))).rejects.toMatchObject({ code: 'permission-denied' });
  const scoped = setup({ role: 'doctor', claims: { role: 'doctor', doctorId: 'DOC-72' } });
  await expect(scoped.service.get(scoped.request({ doctorId: legacyId }))).rejects.toMatchObject({ code: 'permission-denied' });
  const disabled = setup();
  disabled.user.disabled = true;
  await expect(disabled.service.get(disabled.request({ doctorId: legacyId }))).rejects.toMatchObject({ code: 'permission-denied' });
  const forced = setup();
  forced.user.customClaims = { role: 'admin', forcePasswordChange: true };
  await expect(forced.service.get(forced.request({ doctorId: legacyId }))).rejects.toMatchObject({ code: 'permission-denied' });
  const future = setup();
  const fresh = future.request({ doctorId: legacyId });
  fresh.auth.token.auth_time = Math.floor(Date.now() / 1000) + 600;
  await expect(future.service.get(fresh)).rejects.toMatchObject({ code: 'permission-denied' });
  expect(store.read).not.toHaveBeenCalled();

  const own = setup({ role: 'doctor', claims: { role: 'doctor', doctorId: legacyId } });
  await own.service.get(own.request({ doctorId: legacyId }));
  expect(own.store.read).toHaveBeenCalledTimes(1);
});

test('project fails closed on inactive accounts and malformed doctor/schedule rows', async () => {
  for (const { read, code } of [
    { read: async () => ({ user: { active: false }, doctors: raw().doctors }), code: 'permission-denied' },
    { read: async () => ({ user: { active: true }, doctors: [] }), code: 'failed-precondition' },
    { read: async () => raw({ legacyId: 'DOC-72' }), code: 'failed-precondition' },
    { read: async () => raw({ active: false }), code: 'failed-precondition' },
    { read: async () => raw({ branch: { timezone: 'UTC' } }), code: 'failed-precondition' },
    { read: async () => raw({ state: { authority: 'legacy_schedule', updatedAt: '2026-10-20T04:00:00Z' } }), code: 'failed-precondition' },
    { read: async () => raw({ state: { authority: 'doctor_schedule', updatedAt: 'bad' } }), code: 'failed-precondition' },
    { read: async () => raw({ name: '' }), code: 'failed-precondition' },
    { read: async () => raw({ name: 'Dr\u0007' }), code: 'failed-precondition' },
    { read: async () => raw({ id: 'not-a-uuid' }), code: 'failed-precondition' },
    { read: async () => raw({ sessions: Array(15).fill(null).map((_, i) => session(i % 7, i * 2, i * 2 + 1)) }), code: 'failed-precondition' },
    { read: async () => raw({ sessions: [session(7, 0, 60)] }), code: 'failed-precondition' },
    { read: async () => raw({ sessions: [session(1, 660, 540)] }), code: 'failed-precondition' },
    { read: async () => raw({ sessions: [session(1, 0, 1440)] }), code: 'failed-precondition' },
    { read: async () => raw({ sessions: [{ weekday: 1, startMinute: 540, endMinute: 660, extra: 999 }] }), code: 'failed-precondition' },
    { read: async () => raw({ sessions: [session(1, 540, 660), session(1, 600, 720)] }), code: 'failed-precondition' },
    { read: async () => { throw new Error('private SQL detail'); }, code: 'unavailable' },
  ]) {
    const { service, request } = setup({ read: vi.fn(read) });
    const failure = await service.get(request({ doctorId: legacyId })).then(() => null, error => error);
    expect(failure, `expected rejection for ${code}`).not.toBeNull();
    expect(failure.code).toBe(code);
    if (code === 'unavailable') expect(failure.message).not.toContain('private');
  }
});

test('save writes one canonically hashed CAS payload and returns saved', async () => {
  const { store, service, request } = setup({
    read: vi.fn(async () => raw({ sessions: [session(3, 60, 120), session(1, 540, 660)] })),
  });
  const result = await service.save(request(saveInput({ sessions: [session(1, 540, 660), session(3, 60, 120)], requestId: requestId.toUpperCase() })));
  expect(result).toEqual({ saved: true });
  expect(store.save).toHaveBeenCalledTimes(1);
  const data = store.save.mock.calls[0][0];
  expect(Object.keys(data).sort()).toEqual(['actorRole', 'actorUid', 'doctorId', 'doctorLegacyId', 'expectedUpdatedAt', 'operation', 'requestId', 'sessions'].sort());
  expect(data).toMatchObject({
    actorUid: 'staff-actor', actorRole: 'admin', doctorId: doctorRowId, doctorLegacyId: legacyId,
    requestId: requestId.toLowerCase(), expectedUpdatedAt: updatedAt,
    sessions: [session(1, 540, 660), session(3, 60, 120)],
  });
  const { operation, ...bound } = data;
  expect(operation).toBe(`doctor_weekly_hours:${createHash('sha256').update(JSON.stringify(bound)).digest('hex')}`);
  expect(store.receipt).toHaveBeenCalledWith({ actorUid: 'staff-actor', requestId: requestId.toLowerCase() });
});

test('a matching receipt replays the saved result without writing again', async () => {
  const sessions = [session(1, 540, 660)];
  const bound = { actorUid: 'staff-actor', actorRole: 'admin', doctorId: doctorRowId, doctorLegacyId: legacyId,
    requestId: requestId.toLowerCase(), expectedUpdatedAt: updatedAt, sessions };
  const operation = `doctor_weekly_hours:${createHash('sha256').update(JSON.stringify(bound)).digest('hex')}`;
  const { store, service, request } = setup({ receipt: vi.fn(async () => operation) });
  await expect(service.save(request(saveInput({ sessions })))).resolves.toEqual({ saved: true });
  expect(store.save).not.toHaveBeenCalled();

  const mismatch = setup({ receipt: vi.fn(async () => 'doctor_weekly_hours:ffffffff') });
  await expect(mismatch.service.save(mismatch.request(saveInput({ sessions })))).rejects.toMatchObject({ code: 'already-exists' });
  expect(mismatch.store.save).not.toHaveBeenCalled();
});

test('a stale revision is refused before any write', async () => {
  const { store, service, request } = setup();
  await expect(service.save(request(saveInput({ expectedUpdatedAt: '2026-10-19T00:00:00Z' }))))
    .rejects.toMatchObject({ code: 'aborted' });
  expect(store.save).not.toHaveBeenCalled();
});

test('invalid save payloads never reach the store', async () => {
  const { store, service, request } = setup();
  for (const patch of [
    { doctorId: legacyId, sessions: [session(1, 540, 660)], expectedUpdatedAt: updatedAt, requestId: 'nope' },
    { doctorId: legacyId, sessions: Array(15).fill(null).map((_, i) => session(i % 7, i * 2, i * 2 + 1)), expectedUpdatedAt: updatedAt, requestId },
    { doctorId: legacyId, sessions: [session(1, 540, 660), session(1, 600, 720)], expectedUpdatedAt: updatedAt, requestId },
    { doctorId: legacyId, sessions: [session(1, 540, 660)], expectedUpdatedAt: 'bad', requestId },
    { doctorId: legacyId, sessions: [session(1, 540, 660)], expectedUpdatedAt: updatedAt, requestId, extra: 1 },
  ]) {
    await expect(service.save(request(patch))).rejects.toMatchObject({ code: 'invalid-argument' });
  }
  expect(store.read).not.toHaveBeenCalled();
  expect(store.save).not.toHaveBeenCalled();
});

test('lost and uncertain acknowledgements resolve through recheck without double writes', async () => {
  let captured = null;
  const failing = setup({
    save: vi.fn(async data => { captured = data.operation; throw new Error('synthetic transport failure'); }),
    receipt: vi.fn(async () => captured),
  });
  await expect(failing.service.save(failing.request(saveInput()))).resolves.toEqual({ saved: true });
  expect(failing.store.save).toHaveBeenCalledTimes(1);

  const uncertain = setup({ save: vi.fn(async () => { throw new Error('synthetic transport failure'); }) });
  await expect(uncertain.service.save(uncertain.request(saveInput()))).rejects.toMatchObject({ code: 'unavailable' });
  expect(uncertain.store.save).toHaveBeenCalledTimes(1);

  const versionChanged = setup({ save: vi.fn(async () => { throw new Error('WEEKLY_HOURS_VERSION_CHANGED in SQL'); }) });
  await expect(versionChanged.service.save(versionChanged.request(saveInput()))).rejects.toMatchObject({ code: 'aborted' });

  const revoked = setup({ save: vi.fn(async () => { throw new Error('synthetic transport failure'); }) });
  revoked.auth.getUser = vi.fn().mockResolvedValueOnce(revoked.user).mockRejectedValueOnce(new Error('revoked'));
  await expect(revoked.service.save(revoked.request(saveInput()))).rejects.toMatchObject({ code: 'permission-denied' });
});

test('strict callable options are reused and frozen', () => {
  expect(Object.isFrozen(sqlWeeklyHoursCallableOptions)).toBe(true);
  expect(sqlWeeklyHoursCallableOptions).toMatchObject({ region: 'asia-south1', enforceAppCheck: true, maxInstances: 1 });
});
