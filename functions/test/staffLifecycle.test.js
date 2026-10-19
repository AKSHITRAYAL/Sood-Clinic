import { createRequire } from 'node:module';
import { expect, test, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { createStaffLifecycle } = require('../lib/staffLifecycle');

const account = (uid, role = 'manager') => ({ uid, email: `${uid}@example.test`, displayName: uid, disabled: false, customClaims: { role }, tokensValidAfterTime: '1970-01-01T00:00:00Z' });
const request = (data = {}) => ({ auth: { uid: 'admin', token: { role: 'admin', auth_time: 95 } }, data });
function fixture() {
  const users = new Map([['admin', account('admin', 'admin')], ['manager', account('manager')], ['patient', { ...account('patient'), customClaims: {} }]]);
  const auth = {
    getUser: vi.fn(async (uid) => { if (!users.has(uid)) throw { code: 'auth/user-not-found' }; return structuredClone(users.get(uid)); }),
    getUserByEmail: vi.fn(async (email) => { const user = [...users.values()].find((row) => row.email === email); if (!user) throw { code: 'auth/user-not-found' }; return structuredClone(user); }),
    listUsers: vi.fn(async () => ({ users: [...users.values()] })),
    updateUser: vi.fn(async (uid, changes) => { Object.assign(users.get(uid), changes); return users.get(uid); }),
    createUser: vi.fn(async (data) => { users.set(data.uid, { ...account(data.uid), ...data, customClaims: {} }); return users.get(data.uid); }),
    setCustomUserClaims: vi.fn(async (uid, claims) => { users.get(uid).customClaims = claims; }),
    revokeRefreshTokens: vi.fn(async () => {}),
  };
  const store = { begin: vi.fn(async () => {}), finish: vi.fn(async () => {}), abort: vi.fn(async () => {}) };
  return { users, auth, store, lifecycle: createStaffLifecycle({ auth, store, now: () => 100000 }) };
}

test('staff changes write SQL metadata/audit and preserve trusted doctor scope', async () => {
  const { lifecycle, auth, store } = fixture();
  await lifecycle.manage(request({ action: 'updateAccess', email: 'manager@example.test', displayName: 'Doctor Example', role: 'doctor', doctorId: 'brig-ak-sood' }));
  expect(auth.setCustomUserClaims).toHaveBeenCalledWith('manager', { role: 'doctor', doctorId: 'brig-ak-sood', forcePasswordChange: false });
  expect(store.begin).toHaveBeenCalledTimes(1);
  expect(store.finish.mock.calls[0][0]).toMatchObject({ uid: 'manager', role: 'doctor', doctorLegacyId: 'brig-ak-sood' });
  expect(store.finish.mock.calls[0][1]).toMatchObject({ action: 'staff_access_updated', actorUid: 'admin' });
});

test('SQL lock rejection prevents Auth changes', async () => {
  const { lifecycle, auth, store } = fixture();
  store.begin.mockRejectedValue(new Error('BUSY'));
  await expect(lifecycle.manage(request({ action: 'disable', email: 'manager@example.test', disabled: true }))).rejects.toMatchObject({ code: 'unavailable' });
  expect(auth.updateUser).not.toHaveBeenCalled();
  expect(store.abort).not.toHaveBeenCalled();
});

test('does not convert patient accounts or reset an existing account through provision', async () => {
  const { lifecycle, auth } = fixture();
  for (const email of ['patient@example.test', 'manager@example.test']) {
    await expect(lifecycle.manage(request({ action: 'provision', email, displayName: 'Example Staff', role: 'manager', password: 'NewPass9%' }))).rejects.toMatchObject({ code: 'already-exists' });
  }
  expect(auth.createUser).not.toHaveBeenCalled();
  expect(auth.updateUser).not.toHaveBeenCalled();
});

test('rejects self lockout and invalid typed data before mutating Auth', async () => {
  const { lifecycle, auth } = fixture();
  await expect(lifecycle.manage(request({ action: 'disable', email: 'admin@example.test', disabled: true }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(lifecycle.manage(request({ action: 'disable', email: 'manager@example.test', disabled: 'false' }))).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(auth.updateUser).not.toHaveBeenCalled();
});

test('mandatory password completion performs the Auth update before clearing the claim', async () => {
  const { lifecycle, users, auth, store } = fixture();
  users.get('manager').customClaims.forcePasswordChange = true;
  const own = { auth: { uid: 'manager', token: { role: 'manager', forcePasswordChange: true, auth_time: 95 } }, data: { newPassword: 'Changed9%' } };
  await expect(lifecycle.completePassword({ ...own, data: {} })).rejects.toMatchObject({ code: 'invalid-argument' });
  await lifecycle.completePassword(own);
  expect(auth.updateUser).toHaveBeenCalledWith('manager', { password: 'Changed9%' });
  expect(auth.updateUser.mock.invocationCallOrder[0]).toBeLessThan(auth.setCustomUserClaims.mock.invocationCallOrder[0]);
  expect(users.get('manager').customClaims.forcePasswordChange).toBe(false);
  expect(store.finish.mock.calls[0][1]).toMatchObject({ action: 'staff_password_changed', actorRole: 'manager' });
});

test('failed password update keeps the mandatory claim and SQL audit captures incomplete state', async () => {
  const { lifecycle, users, auth, store } = fixture();
  users.get('manager').customClaims.forcePasswordChange = true;
  auth.updateUser.mockRejectedValue(new Error('Provider unavailable'));
  await expect(lifecycle.completePassword({ auth: { uid: 'manager', token: { role: 'manager', auth_time: 95 } }, data: { newPassword: 'Changed9%' } })).rejects.toMatchObject({ code: 'unavailable' });
  expect(auth.setCustomUserClaims).not.toHaveBeenCalled();
  expect(users.get('manager').customClaims.forcePasswordChange).toBe(true);
  expect(store.finish.mock.calls[0][1]).toMatchObject({ action: 'staff_change_incomplete' });
});

test('new staff remains disabled until trusted claims and session revocation succeed', async () => {
  const { lifecycle, auth } = fixture();
  const result = await lifecycle.manage(request({ action: 'provision', email: 'new@example.test', displayName: 'New Manager', role: 'manager', password: 'NewManager9%' }));
  expect(auth.createUser).toHaveBeenCalledWith(expect.objectContaining({ uid: result.uid, disabled: true }));
  expect(auth.setCustomUserClaims.mock.invocationCallOrder[0]).toBeLessThan(auth.updateUser.mock.invocationCallOrder[0]);
  expect(auth.revokeRefreshTokens.mock.invocationCallOrder[0]).toBeLessThan(auth.updateUser.mock.invocationCallOrder[0]);
  expect(auth.updateUser).toHaveBeenCalledWith(result.uid, { disabled: false });
});

test('SQL outage after Auth changes never triggers an unsafe Auth rollback', async () => {
  const { lifecycle, auth, store, users } = fixture();
  store.finish.mockRejectedValue(new Error('SQL unavailable'));
  await expect(lifecycle.manage(request({ action: 'disable', email: 'manager@example.test', disabled: true }))).rejects.toMatchObject({ code: 'unavailable' });
  expect(users.get('manager').disabled).toBe(true);
  expect(auth.updateUser).toHaveBeenCalledTimes(1);
  expect(store.abort).not.toHaveBeenCalled();
});

test('mandatory replacement rejects stale sessions before acquiring a SQL lock', async () => {
  const { auth, store, users } = fixture();
  users.get('manager').customClaims.forcePasswordChange = true;
  const lifecycle = createStaffLifecycle({ auth, store, now: () => 1000000 });
  await expect(lifecycle.completePassword({ auth: { uid: 'manager', token: { role: 'manager', auth_time: 95 } }, data: { newPassword: 'Replacement9%' } })).rejects.toMatchObject({ code: 'permission-denied' });
  expect(store.begin).not.toHaveBeenCalled();
  expect(auth.updateUser).not.toHaveBeenCalled();
});
