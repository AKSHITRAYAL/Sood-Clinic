import { createRequire } from 'node:module';
import { expect, test, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { createHash } = require('node:crypto');
const { createSqlSpecialHours, sqlSpecialHoursCallableOptions } = require('../lib/sqlSpecialHours');

const legacyId = 'DOC-71';
const doctorRowId = 'b0000000-0000-4000-8000-000000000001';
const exceptionId = 'c0ffee00-0000-4000-8000-000000000001';
const requestId = 'C0FFEE00-0000-4000-8000-000000000001';
const updatedAt = '2026-10-20T04:00:00.000000Z';
const date = '2026-10-20';
const window = (startMinute, endMinute) => ({ startMinute, endMinute });
const raw = doctorPatch => ({
  user: { active: true },
  doctors: [{
    id: doctorRowId, legacyId, active: true, name: 'Synthetic Doctor',
    branch: { timezone: 'Asia/Kolkata' },
    state: { authority: 'doctor_schedule', updatedAt: '2026-10-20T04:00:00Z' },
    exceptions: [], ...doctorPatch,
  }],
});
const exception = patch => ({ id: exceptionId, doctorId: doctorRowId, date, kind: 'extra', sessions: [window(540, 660)], ...patch });

function setup({ role = 'admin', claims, read, receipt, save } = {}) {
  const user = { uid: 'staff-actor', disabled: false, customClaims: claims ?? { role }, tokensValidAfterTime: null };
  const auth = { getUser: vi.fn(async () => user) };
  const store = {
    read: read ?? vi.fn(async () => raw()),
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

const saveInput = patch => ({
  doctorId: legacyId, date, kind: 'extra', sessions: [window(540, 660)], expectedUpdatedAt: updatedAt, requestId, ...patch,
});

test('get projects only whitelisted fields and the exception kind/sessions', async () => {
  const { store, service, request } = setup({ read: vi.fn(async () => raw({ exceptions: [exception()] })) });
  const result = await service.get(request({ doctorId: legacyId, date }));
  expect(Object.keys(result).sort()).toEqual(['date', 'doctorId', 'doctorName', 'exception', 'timezone', 'updatedAt'].sort());
  expect(result).toMatchObject({
    date, doctorId: legacyId, doctorName: 'Synthetic Doctor', timezone: 'Asia/Kolkata', updatedAt,
    exception: { kind: 'extra', sessions: [window(540, 660)] },
  });
  expect(JSON.stringify(result)).not.toMatch(/patient|phone|email/i);
  expect(store.read).toHaveBeenCalledWith({ actorUid: 'staff-actor', doctorId: legacyId, date });
  expect(store.save).not.toHaveBeenCalled();
});

test('get returns a null exception when the day has no override and an empty session list when closed', async () => {
  const open = setup();
  expect((await open.service.get(open.request({ doctorId: legacyId, date }))).exception).toBe(null);

  const closed = setup({ read: vi.fn(async () => raw({ exceptions: [exception({ kind: 'closed', sessions: [] })] })) });
  expect((await closed.service.get(closed.request({ doctorId: legacyId, date }))).exception).toEqual({ kind: 'closed', sessions: [] });
});

test('project fails closed on inactive accounts and malformed doctor/exception rows', async () => {
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
    { read: async () => raw({ exceptions: [exception(), exception()] }), code: 'failed-precondition' },
    { read: async () => raw({ exceptions: [exception({ doctorId: '2026-10-20' })] }), code: 'failed-precondition' },
    { read: async () => raw({ exceptions: [exception({ date: '2026-10-21' })] }), code: 'failed-precondition' },
    { read: async () => raw({ exceptions: [exception({ kind: 'invented' })] }), code: 'failed-precondition' },
    { read: async () => raw({ exceptions: [exception({ kind: 'closed' })] }), code: 'failed-precondition' },
    { read: async () => raw({ exceptions: [exception({ sessions: [] })] }), code: 'failed-precondition' },
    { read: async () => raw({ exceptions: [exception({ sessions: [window(660, 540)] })] }), code: 'failed-precondition' },
    { read: async () => raw({ exceptions: [exception({ sessions: [window(0, 1440)] })] }), code: 'failed-precondition' },
    { read: async () => raw({ exceptions: [exception({ sessions: [window(540, 660), window(600, 720)] })] }), code: 'failed-precondition' },
    { read: async () => raw({ exceptions: [exception({ sessions: Array.from({ length: 5 }, (_, index) => window(index * 10, index * 10 + 5)) })] }), code: 'failed-precondition' },
    { read: async () => raw({ exceptions: [exception({ sessions: [{ startMinute: 540, endMinute: 660, extra: 1 }] })] }), code: 'failed-precondition' },
    { read: async () => raw({ exceptions: [exception({ id: 'not-a-uuid' })] }), code: 'failed-precondition' },
    { read: async () => { throw new Error('private SQL detail'); }, code: 'unavailable' },
  ]) {
    const { service, request } = setup({ read: vi.fn(read) });
    const failure = await service.get(request({ doctorId: legacyId, date })).then(() => null, error => error);
    expect(failure).not.toBeNull();
    expect(failure.code).toBe(code);
    if (code === 'unavailable') expect(failure.message).not.toContain('private');
  }
});

test('app context, input shape, live role, scope and freshness gates run before SQL', async () => {
  const { store, service, request } = setup();
  const base = request({ doctorId: legacyId, date });
  for (const patch of [
    { app: undefined }, { app: {} }, { app: { appId: '' } },
    { app: { appId: 'synthetic-app', alreadyConsumed: true } },
  ]) {
    await expect(service.get({ ...base, ...patch })).rejects.toMatchObject({ code: 'failed-precondition' });
  }
  for (const data of [
    { doctorId: legacyId, date, extra: 1 },
    { doctorId: 'x', date },
    { doctorId: legacyId, date: '2026-10-3' },
    { doctorId: legacyId, date: '2026-13-99' },
    { doctorId: legacyId, date: '2026-02-30' },
    { doctorId: legacyId },
  ]) {
    await expect(service.get(request(data))).rejects.toMatchObject({ code: 'invalid-argument' });
  }
  expect(store.read).not.toHaveBeenCalled();

  const manager = setup({ role: 'manager' });
  await expect(manager.service.get(manager.request({ doctorId: legacyId, date }))).rejects.toMatchObject({ code: 'permission-denied' });
  const patient = setup({ role: 'patient' });
  await expect(patient.service.get(patient.request({ doctorId: legacyId, date }))).rejects.toMatchObject({ code: 'permission-denied' });
  const scoped = setup({ role: 'doctor', claims: { role: 'doctor', doctorId: 'DOC-72' } });
  await expect(scoped.service.get(scoped.request({ doctorId: legacyId, date }))).rejects.toMatchObject({ code: 'permission-denied' });
  const disabled = setup();
  disabled.user.disabled = true;
  await expect(disabled.service.get(disabled.request({ doctorId: legacyId, date }))).rejects.toMatchObject({ code: 'permission-denied' });
  const forced = setup();
  forced.user.customClaims = { role: 'admin', forcePasswordChange: true };
  await expect(forced.service.get(forced.request({ doctorId: legacyId, date }))).rejects.toMatchObject({ code: 'permission-denied' });
  const future = setup();
  const fresh = future.request({ doctorId: legacyId, date });
  fresh.auth.token.auth_time = Math.floor(Date.now() / 1000) + 600;
  await expect(future.service.get(fresh)).rejects.toMatchObject({ code: 'permission-denied' });
  expect(store.read).not.toHaveBeenCalled();

  const own = setup({ role: 'doctor', claims: { role: 'doctor', doctorId: legacyId } });
  await own.service.get(own.request({ doctorId: legacyId, date }));
  expect(own.store.read).toHaveBeenCalledTimes(1);
});

test('save writes one canonically hashed CAS payload and returns saved', async () => {
  const { store, service, request } = setup();
  const result = await service.save(request(saveInput({ requestId: requestId.toUpperCase() })));
  expect(result).toEqual({ saved: true });
  expect(store.save).toHaveBeenCalledTimes(1);
  const data = store.save.mock.calls[0][0];
  expect(Object.keys(data).sort()).toEqual(['actorRole', 'actorUid', 'creating', 'date', 'doctorId', 'doctorLegacyId', 'exceptionId', 'expectedUpdatedAt', 'kind', 'operation', 'requestId', 'sessions'].sort());
  expect(data).toMatchObject({
    actorUid: 'staff-actor', actorRole: 'admin', doctorId: doctorRowId, doctorLegacyId: legacyId, date, kind: 'extra',
    requestId: requestId.toLowerCase(), expectedUpdatedAt: updatedAt, sessions: [window(540, 660)], creating: true,
  });
  expect(data.exceptionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  const { operation, exceptionId: _exceptionId, creating: _creating, ...bound } = data;
  expect(operation).toBe(`doctor_special_hours:${createHash('sha256').update(JSON.stringify(bound)).digest('hex')}`);
  expect(store.receipt).toHaveBeenCalledWith({ actorUid: 'staff-actor', requestId: requestId.toLowerCase() });
});

test('editing an existing exception reuses its id and the sorted session windows', async () => {
  const { store, service, request } = setup({ read: vi.fn(async () => raw({ exceptions: [exception()] })) });
  await service.save(request(saveInput({ kind: 'replace', sessions: [window(600, 660), window(540, 560)] })));
  const data = store.save.mock.calls[0][0];
  expect(data).toMatchObject({ exceptionId, creating: false, kind: 'replace', sessions: [window(540, 560), window(600, 660)] });
});

test('a matching receipt replays the saved result without writing again', async () => {
  const sessions = [window(540, 660)];
  const bound = { actorUid: 'staff-actor', actorRole: 'admin', doctorId: doctorRowId, doctorLegacyId: legacyId, date,
    kind: 'extra', sessions, expectedUpdatedAt: updatedAt, requestId: requestId.toLowerCase() };
  const operation = `doctor_special_hours:${createHash('sha256').update(JSON.stringify(bound)).digest('hex')}`;
  const replay = setup({ receipt: vi.fn(async () => operation) });
  await expect(replay.service.save(replay.request(saveInput({ sessions })))).resolves.toEqual({ saved: true });
  expect(replay.store.save).not.toHaveBeenCalled();

  const mismatch = setup({ receipt: vi.fn(async () => 'doctor_special_hours:ffffffff') });
  await expect(mismatch.service.save(mismatch.request(saveInput({ sessions })))).rejects.toMatchObject({ code: 'already-exists' });
  expect(mismatch.store.save).not.toHaveBeenCalled();
});

test('a stale revision and a closed day are refused before any write', async () => {
  const staleRevision = setup();
  await expect(staleRevision.service.save(staleRevision.request(saveInput({ expectedUpdatedAt: '2026-10-19T00:00:00Z' }))))
    .rejects.toMatchObject({ code: 'aborted' });
  expect(staleRevision.store.save).not.toHaveBeenCalled();

  const closedDay = setup({ read: vi.fn(async () => raw({ exceptions: [exception({ kind: 'closed', sessions: [] })] })) });
  await expect(closedDay.service.save(closedDay.request(saveInput())))
    .rejects.toMatchObject({ code: 'failed-precondition' });
  expect(closedDay.store.save).not.toHaveBeenCalled();
});

test('invalid save payloads never reach the store', async () => {
  const { store, service, request } = setup();
  for (const patch of [
    saveInput({ kind: 'closed' }),
    saveInput({ requestId: 'nope' }),
    saveInput({ requestId: 7 }),
    saveInput({ expectedUpdatedAt: 'bad' }),
    saveInput({ sessions: [] }),
    saveInput({ sessions: Array.from({ length: 5 }, (_, index) => window(index * 10, index * 10 + 5)) }),
    saveInput({ sessions: [window(540, 660), window(600, 720)] }),
    saveInput({ sessions: [{ startMinute: 540, endMinute: 660, extra: 1 }] }),
    saveInput({ extra: 1 }),
    saveInput({ doctorId: 'x' }),
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

  const versionChanged = setup({ save: vi.fn(async () => { throw new Error('SPECIAL_HOURS_VERSION_CHANGED in SQL'); }) });
  await expect(versionChanged.service.save(versionChanged.request(saveInput()))).rejects.toMatchObject({ code: 'aborted' });

  const dateConflict = setup({ save: vi.fn(async () => { throw new Error('SPECIAL_HOURS_DATE_CONFLICT in SQL'); }) });
  await expect(dateConflict.service.save(dateConflict.request(saveInput()))).rejects.toMatchObject({ code: 'aborted' });

  const revoked = setup({ save: vi.fn(async () => { throw new Error('synthetic transport failure'); }) });
  revoked.auth.getUser = vi.fn().mockResolvedValueOnce(revoked.user).mockRejectedValueOnce(new Error('revoked'));
  await expect(revoked.service.save(revoked.request(saveInput()))).rejects.toMatchObject({ code: 'permission-denied' });
});

test('strict callable options are reused and frozen', () => {
  expect(Object.isFrozen(sqlSpecialHoursCallableOptions)).toBe(true);
  expect(sqlSpecialHoursCallableOptions).toMatchObject({ region: 'asia-south1', enforceAppCheck: true, maxInstances: 1 });
});
