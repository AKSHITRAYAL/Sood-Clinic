import { createRequire } from 'node:module';
import { expect, test, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { createSqlPatientProfiles } = require('../lib/sqlPatientProfiles');
const patientId = '50000000-0000-4000-8000-000000000001';
const requestId = '60000000-0000-4000-8000-000000000001';
const updatedAt = '2026-10-20T00:00:00.123456Z';
const profile = { displayName: 'Synthetic Patient', phone: '+919876543210', dateOfBirth: '2000-02-29', addressLine1: 'Synthetic address' };
function setup() {
  const user = { uid: 'patient-account', emailVerified: true, disabled: false, customClaims: {} };
  const row = { relationship: 'self', verifiedBy: 'clinic-manager', verifiedAt: updatedAt, patient: { id: patientId.replaceAll('-', ''), uhid: 'TEST-ONLY', ...profile, email: 'private@example.test', archivedAt: null, updatedAt, legacyCreatedByUid: 'private-actor', healthNotes: 'private-health' } };
  const auth = { getUser: vi.fn(async () => user) };
  const store = { list: vi.fn(async () => [row]), read: vi.fn(async () => row), receipt: vi.fn(async () => null), save: vi.fn() };
  const service = createSqlPatientProfiles({ auth, store, now: () => Date.parse(updatedAt) });
  const request = data => ({ auth: { uid: user.uid, token: { email_verified: true, auth_time: 100 } }, data });
  const save = (patch = {}) => service.save(request({ patientId, requestId, expectedUpdatedAt: updatedAt, profile, ...patch }));
  return { user, row, auth, store, service, request, save };
}
test('linked patient reads expose only demographic fields, explicit UUID and revision', async () => {
  const { service, request, store } = setup();
  const result = await service.get(request({ patientId }));
  expect(result.profile).toMatchObject({ patientId, uhid: 'TEST-ONLY', displayName: profile.displayName, updatedAt });
  expect(result.profile).not.toHaveProperty('healthNotes');
  expect(result.profile).not.toHaveProperty('legacyCreatedByUid');
  expect(result.profile).not.toHaveProperty('email');
  expect(store.read).toHaveBeenCalledWith({ actorUid: 'patient-account', patientId });
  expect((await service.list(request({}))).patients).toEqual([{ patientId, uhid: 'TEST-ONLY', displayName: profile.displayName, relationship: 'self' }]);
});
test('unverified, disabled, staff, revoked and future sessions fail before any SQL access', async () => {
  for (const patch of [{ emailVerified: false }, { disabled: true }, { customClaims: { role: 'manager' } }, { tokensValidAfterTime: '2026-10-20T00:00:00Z' }]) {
    const { user, service, request, store } = setup(); Object.assign(user, patch);
    await expect(service.list(request({}))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(store.list).not.toHaveBeenCalled();
  }
  const { service, request, store } = setup(); const req = request({}); req.auth.token.auth_time = 9999999999;
  await expect(service.list(req)).rejects.toMatchObject({ code: 'permission-denied' });
  expect(store.list).not.toHaveBeenCalled();
});
test('missing, unverified, invalid-relationship and archived links cannot read or edit', async () => {
  for (const change of [null, { relationship: 'other' }, { verifiedBy: '' }, { verifiedAt: null }, { patient: { archivedAt: updatedAt } }]) {
    const { row, store, service, request, save } = setup();
    store.read.mockResolvedValue(change === null ? null : { ...row, ...change });
    await expect(service.get(request({ patientId }))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(save()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(store.save).not.toHaveBeenCalled();
  }
});
test('save validates actual dates/phones, refuses ownership/clinical fields and preserves microsecond revisions', async () => {
  const { save, store } = setup();
  for (const patch of [{ dateOfBirth: '2001-02-29' }, { dateOfBirth: '2099-01-01' }, { phone: 'not-a-phone' }, { displayName: '' }, { healthNotes: 'not-demographic' }, { email: 'new@example.test' }, { uhid: 'changed' }, { title: '<script>' }]) {
    await expect(save({ profile: { ...profile, ...patch } })).rejects.toMatchObject({ code: 'invalid-argument' });
  }
  await expect(save()).resolves.toEqual({ saved: true });
  expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ patientId, actorUid: 'patient-account', expectedUpdatedAt: updatedAt, displayName: profile.displayName, city: null }));
});
test('stale edits fail; retries bind payload and reconcile a lost acknowledgement only after checking current access', async () => {
  const { save, row, store, user } = setup();
  row.patient.updatedAt = '2026-10-20T00:00:00.123457Z';
  await expect(save()).rejects.toMatchObject({ code: 'aborted' });
  row.patient.updatedAt = updatedAt;
  store.save.mockImplementation(async data => { store.receipt.mockResolvedValue(data.operation); throw Error('Synthetic lost response'); });
  await expect(save()).resolves.toEqual({ saved: true });
  await expect(save()).resolves.toEqual({ saved: true });
  await expect(save({ profile: { ...profile, displayName: 'Changed' } })).rejects.toMatchObject({ code: 'already-exists' });
  store.read.mockResolvedValue(null);
  await expect(save()).rejects.toMatchObject({ code: 'permission-denied' });
  user.disabled = true;
  await expect(save()).rejects.toMatchObject({ code: 'permission-denied' });
  expect(store.save).toHaveBeenCalledTimes(1);
});
test('oversized/duplicate linked censuses fail closed and SQL errors never reveal private details', async () => {
  const { service, request, store, row, save } = setup();
  for (const rows of [Array(21).fill(row), [row, row]]) {
    store.list.mockResolvedValue(rows);
    await expect(service.list(request({}))).rejects.toMatchObject({ code: 'failed-precondition' });
  }
  store.save.mockRejectedValue(Error('private-name private-health'));
  await expect(save()).rejects.toMatchObject({ code: 'unavailable' });
  await expect(save()).rejects.not.toThrow('private-name');
});
