import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), unsubscribe: vi.fn(), listener: null, auth: { currentUser: null } }));
vi.mock('firebase/auth', () => ({ onIdTokenChanged: (_auth, listener) => { mocks.listener = listener; return mocks.unsubscribe; } }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => mocks.invoke }));
vi.mock('../lib/firebase', () => ({ auth: mocks.auth, functions: {} }));
import { staffAccessState, watchStaffSession } from './staffSessionService';
beforeEach(() => { mocks.invoke.mockReset(); mocks.unsubscribe.mockReset(); mocks.auth.currentUser = null; });
afterEach(() => { vi.restoreAllMocks(); });
test('uses one session observer and fails closed when verification fails', async () => {
  const states = []; const observer = watchStaffSession((state) => states.push(state));
  await mocks.listener(null);
  expect(states.at(-1).status).toBe('signed-out');
  mocks.invoke.mockRejectedValue(new Error('private details'));
  mocks.auth.currentUser = { uid: 'test', getIdToken: vi.fn() };
  await observer.refresh(true);
  expect(states.at(-1).status).toBe('error');
  observer.unsubscribe();
  expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
});
test('ignores a late authenticated result after sign out', async () => {
  let resolve; mocks.invoke.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const states = []; const observer = watchStaffSession((state) => states.push(state));
  mocks.listener({ uid: 'test' });
  mocks.listener(null);
  resolve({ data: { role: 'admin', doctorId: null, mustChangePassword: false } });
  await Promise.resolve(); await Promise.resolve();
  expect(states.at(-1).status).toBe('signed-out');
  observer.unsubscribe();
});
test('shared decisions cover signed out, role mismatch and mandatory replacement', () => {
  const session = { status: 'allowed', role: 'doctor', mustChangePassword: false };
  expect(staffAccessState(session, 'doctor')).toBe('allowed');
  expect(staffAccessState(session, 'admin')).toBe('denied');
  expect(staffAccessState({ ...session, mustChangePassword: true }, 'doctor')).toBe('password-change');
  expect(staffAccessState({ ...session, mustChangePassword: true }, undefined, true)).toBe('allowed');
});

test('does not check before Auth restoration and reuses a recent verification', async () => {
  const observer = watchStaffSession(() => {});
  await observer.refresh(true);
  expect(mocks.invoke).not.toHaveBeenCalled();
  const user = { uid: 'test' }; mocks.auth.currentUser = user;
  mocks.invoke.mockResolvedValue({ data: { role: 'admin', doctorId: null, mustChangePassword: false } });
  await mocks.listener(user);
  await observer.refresh();
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
  const later = Date.now() + 61000;
  vi.spyOn(Date, 'now').mockReturnValue(later);
  await observer.refresh();
  expect(mocks.invoke).toHaveBeenCalledTimes(2);
  observer.unsubscribe();
});

test('malformed doctor scope never opens a protected route', async () => {
  const states = []; const observer = watchStaffSession((state) => states.push(state));
  mocks.invoke.mockResolvedValue({ data: { role: 'doctor', mustChangePassword: false } });
  await mocks.listener({ uid: 'test' });
  expect(states.at(-1).status).toBe('error');
  observer.unsubscribe();
});
