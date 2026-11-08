// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ signIn: vi.fn(), send: vi.fn(), signOut: vi.fn(), navigate: vi.fn(), callable: vi.fn(), create: vi.fn(), update: vi.fn() }));
vi.mock('firebase/auth', () => ({ signInWithEmailAndPassword: mocks.signIn, sendEmailVerification: mocks.send, createUserWithEmailAndPassword: mocks.create, updateProfile: mocks.update }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => mocks.callable }));
vi.mock('../lib/firebase', () => ({ auth: { signOut: mocks.signOut }, authReady: Promise.resolve(), functions: {} }));
vi.mock('react-router-dom', async (importOriginal) => ({ ...await importOriginal(), useNavigate: () => mocks.navigate }));
vi.mock('../components/Navbar', () => ({ default: () => null }));
vi.mock('../components/Footer', () => ({ default: () => null }));
import Login from './Login';
const user = (verified = false, role) => ({ emailVerified: verified, displayName: 'Patient', getIdTokenResult: vi.fn(async () => ({ claims: { role } })) });
const enter = () => { fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'patient@example.com' } }); fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password1' } }); };
beforeEach(() => { vi.clearAllMocks(); mocks.signOut.mockResolvedValue(); mocks.callable.mockResolvedValue({}); });
afterEach(cleanup);
test('unverified patient can request a new email without entering the portal', async () => {
  const account = user(); mocks.signIn.mockResolvedValue({ user: account }); mocks.send.mockResolvedValue();
  render(<MemoryRouter><Login /></MemoryRouter>); enter(); fireEvent.click(screen.getByText('Sign in securely'));
  fireEvent.click(await screen.findByText('Resend verification email'));
  await screen.findByText(/Verification email requested/);
  expect(mocks.send).toHaveBeenCalledWith(account); expect(mocks.signOut).toHaveBeenCalledTimes(2); expect(mocks.navigate).not.toHaveBeenCalled();
});
test('a failed resend reports the error without claiming it was sent', async () => {
  mocks.signIn.mockResolvedValue({ user: user() }); mocks.send.mockRejectedValue({ code: 'auth/too-many-requests' });
  render(<MemoryRouter><Login /></MemoryRouter>); enter(); fireEvent.click(screen.getByText('Sign in securely'));
  fireEvent.click(await screen.findByText('Resend verification email'));
  await screen.findByText(/Too many attempts/); expect(screen.queryByText(/Verification email requested/)).toBeNull();
});
test('verified patients sign in and receptionists are sent to staff sign-in', async () => {
  mocks.signIn.mockResolvedValueOnce({ user: user(true) }).mockResolvedValueOnce({ user: user(true, 'receptionist') });
  render(<MemoryRouter><Login /></MemoryRouter>); enter(); fireEvent.click(screen.getByText('Sign in securely'));
  await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith('/patient'));
  fireEvent.click(screen.getByText('Sign in securely')); await screen.findByText(/This is a staff account/);
});
