import { beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ reauthenticate: vi.fn(), updatePassword: vi.fn(), signOut: vi.fn(), invoke: vi.fn() }));
vi.mock('firebase/auth', () => ({ EmailAuthProvider: { credential: () => ({}) }, reauthenticateWithCredential: mocks.reauthenticate, signOut: mocks.signOut, updatePassword: mocks.updatePassword }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => mocks.invoke }));
vi.mock('../lib/firebase', () => ({ auth: {}, functions: {} }));
import { changeStaffPassword } from './staffAccountService';
beforeEach(() => { Object.values(mocks).forEach((mock) => mock.mockReset()); });
test('mandatory replacement is performed by the backend after fresh authentication', async () => {
  const user = { email: 'staff@example.test', getIdToken: vi.fn() };
  await changeStaffPassword(user, 'Temporary9%', 'Replacement9%', true);
  expect(user.getIdToken).toHaveBeenCalledWith(true);
  expect(mocks.invoke).toHaveBeenCalledWith({ newPassword: 'Replacement9%', requestId: expect.any(String) });
  expect(mocks.updatePassword).not.toHaveBeenCalled();
  expect(mocks.signOut).toHaveBeenCalledTimes(1);
});
test('ordinary password change keeps the Firebase Auth flow', async () => {
  const user = { email: 'staff@example.test' };
  await changeStaffPassword(user, 'OldPassword9%', 'NewPassword9%', false);
  expect(mocks.updatePassword).toHaveBeenCalledWith(user, 'NewPassword9%');
  expect(mocks.invoke).not.toHaveBeenCalled();
});
test('failed backend completion never claims success or signs out silently', async () => {
  mocks.invoke.mockRejectedValue(new Error('private internal details'));
  await expect(changeStaffPassword({ email: 'staff@example.test', getIdToken: vi.fn() }, 'OldPassword9%', 'NewPassword9%', true)).rejects.toThrow('could not be confirmed');
  expect(mocks.signOut).not.toHaveBeenCalled();
});
