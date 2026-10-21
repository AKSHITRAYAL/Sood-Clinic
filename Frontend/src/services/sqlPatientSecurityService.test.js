import { beforeEach, expect, test, vi } from 'vitest';
const { credential, reauth, updatePass, signOut, sendReset, state } = vi.hoisted(() => ({ credential: vi.fn(() => 'synthetic-credential'), reauth: vi.fn(async () => {}), updatePass: vi.fn(async () => {}), signOut: vi.fn(async () => {}), sendReset: vi.fn(async () => {}), state: { user: null } }));
vi.mock('firebase/auth', () => ({ EmailAuthProvider: { credential }, reauthenticateWithCredential: reauth, updatePassword: updatePass, signOut, sendPasswordResetEmail: sendReset }));
vi.mock('../lib/firebase', () => ({ auth: { get currentUser() { return state.user; } } }));
import { sqlPatientSecurityService } from './sqlPatientSecurityService';
import { passwordPolicyMessage } from '../lib/passwordPolicy';

const uid = 'synthetic-patient-uid';
const account = (patch = {}) => ({ uid, email: 'patient@example.test', getIdTokenResult: vi.fn(async () => ({ claims: {} })), ...patch });

beforeEach(() => { credential.mockClear(); reauth.mockClear(); updatePass.mockClear(); signOut.mockClear(); sendReset.mockClear(); state.user = null; });

test('password change enforces the shared policy before touching provider APIs', async () => {
  state.user = account();
  await expect(sqlPatientSecurityService.changePassword(uid, 'current', 'weak')).rejects.toThrow(passwordPolicyMessage);
  await expect(sqlPatientSecurityService.changePassword(uid, '', 'Str0ng!Pass')).rejects.toThrow(passwordPolicyMessage);
  expect(reauth).not.toHaveBeenCalled();
  expect(updatePass).not.toHaveBeenCalled();
});

test('password change reauthenticates, updates and signs out only the same account', async () => {
  state.user = account();
  expect(await sqlPatientSecurityService.changePassword(uid, 'OldCurrent1!', 'NewStrong1!')).toEqual({ changed: true });
  expect(credential).toHaveBeenCalledWith('patient@example.test', 'OldCurrent1!');
  expect(reauth).toHaveBeenCalledWith(state.user, 'synthetic-credential');
  expect(updatePass).toHaveBeenCalledWith(state.user, 'NewStrong1!');
  expect(signOut).toHaveBeenCalledTimes(1);
  for (const patch of [{ getIdTokenResult: async () => ({ claims: { role: 'admin' } }) }, { getIdTokenResult: async () => ({ claims: { forcePasswordChange: true } }) }, { email: undefined }]) {
    state.user = account(patch);
    await expect(sqlPatientSecurityService.changePassword(uid, 'OldCurrent1!', 'NewStrong1!')).rejects.toThrow('Sign in again with your patient account.');
  }
  expect(reauth).toHaveBeenCalledTimes(1);
});

test('an account transition mid-change never signs out or touches the other account', async () => {
  state.user = account();
  updatePass.mockImplementation(async () => { state.user = account({ uid: 'switched-account' }); });
  await expect(sqlPatientSecurityService.changePassword(uid, 'OldCurrent1!', 'NewStrong1!')).resolves.toEqual({ changed: true });
  expect(signOut).not.toHaveBeenCalled();
});

test('reset requests are bound to the current account and the changed session', async () => {
  await expect(sqlPatientSecurityService.sendReset(uid)).rejects.toThrow('Sign in again with your patient account.');
  state.user = account();
  expect(await sqlPatientSecurityService.sendReset(uid)).toEqual({ sent: true });
  expect(sendReset).toHaveBeenCalledWith(expect.objectContaining({ currentUser: state.user }), 'patient@example.test');
  sendReset.mockClear();
  state.user = account();
  state.user.getIdTokenResult = async () => { state.user = account({ uid: 'switched-account' }); return { claims: {} }; };
  await expect(sqlPatientSecurityService.sendReset(uid)).rejects.toThrow('Sign in again with your patient account.');
  expect(sendReset).not.toHaveBeenCalled();
});
