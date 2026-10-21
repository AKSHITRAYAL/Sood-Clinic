import { beforeEach, expect, test, vi } from 'vitest';
const { getOwn, saveOwn, state } = vi.hoisted(() => ({ getOwn: vi.fn(), saveOwn: vi.fn(), state: { user: null } }));
vi.mock('../../../SQL/generated/clinic/esm/index.esm.js', () => ({ getOwnSqlProfile: getOwn, saveOwnSqlProfile: saveOwn, connectorConfig: { serviceId: 'synthetic-service' } }));
vi.mock('firebase/data-connect', () => ({ getDataConnect: vi.fn(() => 'synthetic-dc') }));
vi.mock('../lib/firebase', () => ({ auth: { get currentUser() { return state.user; } }, firebaseApp: {} }));
import { sqlPatientAccountService } from './sqlPatientAccountService';

const uid = 'synthetic-patient-uid';
const requestId = '60000000-0000-4000-8000-000000000001';
const account = (patch = {}) => ({ uid, emailVerified: true, reload: vi.fn(async () => {}), getIdTokenResult: vi.fn(async () => ({ claims: { email_verified: true } })), ...patch });

beforeEach(() => { getOwn.mockReset(); saveOwn.mockReset(); state.user = null; });

test('get requires the exact live verified non-staff account and reads server-only', async () => {
  await expect(sqlPatientAccountService.get(uid)).rejects.toThrow('Sign in again with a verified patient account.');
  state.user = account({ uid: 'another-account' });
  await expect(sqlPatientAccountService.get(uid)).rejects.toThrow('Sign in again with a verified patient account.');
  for (const patch of [{ emailVerified: false }, { getIdTokenResult: async () => ({ claims: { email_verified: true, role: 'manager' } }) }, { getIdTokenResult: async () => ({ claims: { email_verified: true, forcePasswordChange: true } }) }, { getIdTokenResult: async () => ({ claims: {} }) }]) {
    state.user = account(patch);
    await expect(sqlPatientAccountService.get(uid)).rejects.toThrow('Sign in again with a verified patient account.');
  }
  expect(getOwn).not.toHaveBeenCalled();
  state.user = account();
  getOwn.mockResolvedValue({ data: { user: { id: uid, displayName: 'Synthetic Account', active: true, email: 'private@example.test' } } });
  expect(await sqlPatientAccountService.get(uid)).toEqual({ accountUid: uid, displayName: 'Synthetic Account', active: true });
  expect(getOwn).toHaveBeenCalledWith('synthetic-dc', { fetchPolicy: 'SERVER_ONLY' });
  getOwn.mockResolvedValue({ data: { user: null } });
  // No account row yet: the module uses null to offer initialization, never access.
  await expect(sqlPatientAccountService.get(uid)).resolves.toBe(null);
  for (const user of [{ id: 'other-uid', displayName: 'Synthetic', active: true }, { id: uid, displayName: 'Synthetic', active: false }, { id: uid, displayName: '   ', active: true }, { id: uid, displayName: 7, active: true }]) {
    getOwn.mockResolvedValue({ data: { user } });
    await expect(sqlPatientAccountService.get(uid)).rejects.toThrow('Sign in again with a verified patient account.');
  }
});

test('initialize validates input, binds the server-owned UID and confirms the account', async () => {
  state.user = account();
  for (const [name, id] of [[' A', requestId], ['Synthetic Account', 'not-a-uuid'], [`Synthetic${String.fromCharCode(9)}`, requestId], [7, requestId], ['Synthetic Account', undefined]]) {
    await expect(sqlPatientAccountService.initialize(uid, name, id)).rejects.toThrow('Enter an account name between 2 and 160 characters.');
  }
  expect(saveOwn).not.toHaveBeenCalled();
  saveOwn.mockResolvedValue({});
  getOwn.mockResolvedValue({ data: { user: { id: uid, displayName: 'Synthetic Account', active: true } } });
  expect(await sqlPatientAccountService.initialize(uid, '  Synthetic Account  ', requestId)).toEqual({ accountUid: uid, displayName: 'Synthetic Account', active: true });
  expect(saveOwn).toHaveBeenCalledWith('synthetic-dc', { displayName: 'Synthetic Account', requestId });
  const sent = saveOwn.mock.calls[0][1];
  expect(Object.keys(sent).sort()).toEqual(['displayName', 'requestId'].sort());
});

test('uncertain initialization is never retried automatically and an account switch fails closed', async () => {
  state.user = account();
  saveOwn.mockRejectedValue(new Error('Synthetic lost receipt'));
  await expect(sqlPatientAccountService.initialize(uid, 'Synthetic Account', requestId)).rejects.toThrow('Synthetic lost receipt');
  expect(getOwn).not.toHaveBeenCalled();
  saveOwn.mockImplementation(async () => { state.user = account({ uid: 'switched-account' }); });
  getOwn.mockResolvedValue({ data: { user: { id: uid, displayName: 'Synthetic Account', active: true } } });
  await expect(sqlPatientAccountService.initialize(uid, 'Synthetic Account', requestId)).rejects.toThrow('Sign in again with a verified patient account.');
  saveOwn.mockReset();
  state.user = account();
  getOwn.mockResolvedValue({ data: { user: null } });
  await expect(sqlPatientAccountService.initialize(uid, 'Synthetic Account', requestId)).rejects.toThrow('Account initialization could not be confirmed. Reload account status before continuing.');
});
