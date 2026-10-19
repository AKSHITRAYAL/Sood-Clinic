import { createRequire } from 'node:module';
import { expect, test } from 'vitest';
const require = createRequire(import.meta.url);
const { requireLiveStaff, requireOAuthAdministrator } = require('../lib/staffAuthorization');
const request = (token = {}) => ({ auth: { uid: 'doctor', token: { role: 'doctor', doctorId: 'doctor-a', auth_time: 100, ...token } } });
const current = (claims = {}, extra = {}) => ({ uid: 'doctor', disabled: false, tokensValidAfterTime: '1970-01-01T00:00:00Z', customClaims: { role: 'doctor', doctorId: 'doctor-a', ...claims }, ...extra });
const verify = (user, req = request(), options) => requireLiveStaff({ getUser: async () => user }, req, options);

test('validates current doctor scope and requested resource scope', async () => {
  await expect(verify(current(), request(), { roles: ['doctor'], doctorId: 'doctor-a' })).resolves.toMatchObject({ uid: 'doctor' });
  await expect(verify(current(), request(), { doctorId: 'doctor-b' })).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(verify(current({ doctorId: 'doctor-b' }))).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(verify(current({ doctorId: '' }), request({ doctorId: '' }))).rejects.toMatchObject({ code: 'permission-denied' });
});
test('rejects disabled, demoted, forced-password and revoked sessions', async () => {
  for (const user of [current({}, { disabled: true }), current({ role: 'manager' }), current({ forcePasswordChange: true }), current({}, { tokensValidAfterTime: '1970-01-01T00:01:41Z' })]) {
    await expect(verify(user)).rejects.toMatchObject({ code: 'permission-denied' });
  }
  await expect(verify(current(), request(), { roles: ['admin'] })).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(verify(current(), {})).rejects.toMatchObject({ code: 'permission-denied' });
});
test('session inspection can route a forced-change user to password replacement', async () => {
  await expect(verify(current({ forcePasswordChange: true }), request({ forcePasswordChange: true }), { allowForcedPassword: true })).resolves.toMatchObject({ uid: 'doctor' });
});

test('OAuth callback rejects disabled, demoted or revoked administrator grants', async () => {
  const admin = current({ role: 'admin' });
  const auth = (user) => ({ getUser: async () => user });
  await expect(requireOAuthAdministrator(auth(admin), 'doctor', 1000)).resolves.toMatchObject({ uid: 'doctor' });
  for (const user of [current(), { ...admin, disabled: true }, { ...admin, tokensValidAfterTime: '1970-01-01T00:00:02Z' }]) {
    await expect(requireOAuthAdministrator(auth(user), 'doctor', 1000)).rejects.toMatchObject({ code: 'permission-denied' });
  }
});
