import { createRequire } from 'node:module';
import { expect, test, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { createSqlAuditLog } = require('../lib/sqlAuditLog');

const now = Math.floor(Date.now() / 1000);
const uid = 'synthetic-admin';
const app = { appId: 'synthetic-app' };
const token = (patch = {}) => ({ role: 'admin', auth_time: now - 60, ...patch });
const request = ({ token: tokenPatch = {}, app: appPatch = {}, data } = {}) => ({
  app: appPatch === null ? undefined : { ...app, ...appPatch },
  auth: { uid, token: token(tokenPatch) },
  ...(data === undefined ? { data: {} } : { data }),
});
const auth = (patch = {}) => ({
  getUser: vi.fn(async () => ({ uid, disabled: false, customClaims: { role: 'admin' }, ...patch })),
});
const setup = (rows = [], authPatch = {}) => {
  const store = { read: vi.fn(async () => rows) };
  return { store, service: createSqlAuditLog({ auth: auth(authPatch), store }) };
};
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const instant = n => `2026-10-20T04:${String(n).padStart(2, '0')}:00.000000Z`;
const row = (n, patch = {}) => ({
  id: id(n), occurredAt: instant(n), action: 'patient_searched', actorRole: 'admin',
  actorUid: uid, resourceType: 'patient', resourceId: 'SYNTHETIC-UHID', ...patch,
});
const descending = count => Array.from({ length: count }, (_, index) => row(count - index));

test('a valid page returns only the operational projection and a cursor-free first call', async () => {
  const { store, service } = setup([row(3), row(2)]);
  const result = await service.list(request());
  expect(store.read).toHaveBeenCalledWith({ actorUid: uid, actorRole: 'admin', cursor: null });
  expect(result.events).toEqual([row(3), row(2)].map(({ occurredAt, ...rest }) => ({ at: occurredAt, ...rest })));
  expect(result.nextCursor).toBeNull();
  expect(Object.keys(result.events[0]).sort()).toEqual(['action', 'actorRole', 'actorUid', 'at', 'id', 'resourceId', 'resourceType']);
  expect(JSON.stringify(result)).not.toMatch(/metadata|searchTerm|phone|synthetic-admin@/);
});

test('a 22-row sentinel yields 20 rows plus a cursor, and a matching cursor row is dropped', async () => {
  const rows = descending(22);
  const first = setup(rows).service;
  await expect(first.list(request())).rejects.toMatchObject({ code: 'failed-precondition' });

  const { service } = setup(rows);
  const result = await service.list(request({ data: { cursor: { occurredAt: rows[0].occurredAt } } }));
  expect(result.events).toHaveLength(20);
  expect(result.events[0].id).toBe(rows[1].id);
  expect(result.nextCursor).toEqual({ occurredAt: result.events.at(-1).at });
});

test('a cursor for an older row is not stripped and keeps pagination monotonic', async () => {
  const rows = [row(5), row(4), row(3)];
  const { store, service } = setup(rows);
  const result = await service.list(request({ data: { cursor: { occurredAt: instant(6) } } }));
  expect(store.read.mock.calls[0][0].cursor).toEqual({ occurredAt: instant(6) });
  expect(result.events).toHaveLength(3);
  expect(result.nextCursor).toBeNull();
});

test('malformed cursor or over-specified input is an invalid argument before any read', async () => {
  const { store, service } = setup([row(1)]);
  for (const data of [
    { cursor: { occurredAt: '2026-10-20T04:00:00.Z' } },
    { cursor: { occurredAt: '2026-10-20T04:00:00.000' } },
    { cursor: { occurredAt: '2026-13-20T04:00:00.000000Z' } },
    { cursor: { occurredAt: instant(1), id: id(1) } },
    { cursor: instant(1) },
    { extra: true },
  ]) {
    await expect(service.list(request({ data }))).rejects.toMatchObject({ code: 'invalid-argument' });
  }
  expect(store.read).not.toHaveBeenCalled();
});

test('a missing, spoofed or already-consumed app context is refused', async () => {
  const { store, service } = setup([row(1)]);
  for (const appPatch of [null, { appId: '' }, { alreadyConsumed: true }]) {
    await expect(service.list(request({ app: appPatch }))).rejects.toMatchObject({ code: 'failed-precondition' });
  }
  expect(store.read).not.toHaveBeenCalled();
});

test('only a live administrator reaches the store', async () => {
  const { store, service } = setup([row(1)]);
  for (const tokenPatch of [{ role: 'manager' }, { role: 'doctor' }, { role: 'patient' }, { role: '' }]) {
    await expect(service.list(request({ token: tokenPatch }))).rejects.toMatchObject({ code: 'permission-denied' });
  }
  expect(store.read).not.toHaveBeenCalled();
  const { service: live } = setup([row(1)]);
  await expect(live.list(request({ token: { auth_time: now - 600 } }))).resolves.toBeTruthy();
  const { service: stale } = setup([row(1)], { tokensValidAfterTime: new Date((now - 30) * 1000).toISOString() });
  await expect(stale.list(request())).rejects.toMatchObject({ code: 'permission-denied' });
  const { service: mismatched } = setup([row(1)], { customClaims: { role: 'manager' } });
  await expect(mismatched.list(request())).rejects.toMatchObject({ code: 'permission-denied' });
  const { service: disabled } = setup([row(1)], { disabled: true });
  await expect(disabled.list(request())).rejects.toMatchObject({ code: 'permission-denied' });
  const { service: forced } = setup([row(1)], { customClaims: { role: 'admin', forcePasswordChange: true } });
  await expect(forced.list(request())).rejects.toMatchObject({ code: 'permission-denied' });
});

test('a future-issued session is refused after the live account check', async () => {
  const { store, service } = setup([row(1)]);
  await expect(service.list(request({ token: { auth_time: now + 3600 } }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(store.read).not.toHaveBeenCalled();
});

test('row contract violations fail closed rather than rendering a partial page', async () => {
  const bad = [
    [row(1, { id: 'not-a-uuid' })],
    [row(1, { occurredAt: '2026-10-20T04:00:00Z' }), row(2)],
    [row(1, { action: '' })],
    [row(1, { action: 'a'.repeat(121) })],
    [row(1, { action: 'patient\u0007search' })],
    [row(1, { actorRole: 'x'.repeat(41) })],
    [row(1, { actorUid: 'u'.repeat(201) })],
    [row(1, { resourceType: 'x'.repeat(81) })],
    [row(1, { resourceId: 'x'.repeat(201) })],
    [row(1, { resourceId: null })],
    [row(1), row(1)],
    [row(1, { occurredAt: instant(1) }), row(2, { occurredAt: instant(2) })],
    [row(1, { id: id(1) }), row(2, { id: id(1) })],
    [null],
    'rows',
  ];
  for (const rows of bad) {
    const { service } = setup(rows);
    await expect(service.list(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  }
});

test('equal timestamps are ordered by descending id and a null actor is allowed', async () => {
  const rows = [row(1, { id: id(2), actorUid: null }), row(1, { id: id(1) })];
  const { service } = setup(rows);
  const result = await service.list(request());
  expect(result.events.map(event => event.id)).toEqual([id(2), id(1)]);
  expect(result.events[0].actorUid).toBeNull();

  const { service: tie } = setup([row(1, { id: id(1) }), row(1, { id: id(2) })]);
  await expect(tie.list(request())).rejects.toMatchObject({ code: 'failed-precondition' });
});

test('store failures become a PHI-free unavailable error and HttpsErrors pass through', async () => {
  const { HttpsError } = require('firebase-functions/v2/https');
  const { store, service } = setup([row(1)]);
  store.read.mockRejectedValueOnce(new Error('synthetic private SQL detail'));
  await expect(service.list(request())).rejects.toMatchObject({ code: 'unavailable', message: 'The activity log could not be loaded. Please retry.' });
  store.read.mockRejectedValueOnce(new HttpsError('permission-denied', 'Current administrator access is required.'));
  await expect(service.list(request())).rejects.toMatchObject({ code: 'permission-denied' });
});
