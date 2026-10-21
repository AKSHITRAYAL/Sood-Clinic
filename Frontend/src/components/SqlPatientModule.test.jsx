// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
vi.mock('../lib/firebase', () => ({ functions: {}, auth: {}, firebaseApp: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => vi.fn() }));
import SqlPatientModule from './SqlPatientModule';

const uid = 'synthetic-patient-uid';
const patientId = '50000000-0000-4000-8000-000000000001';
const updatedAt = '2026-10-20T00:00:00.123456Z';
const profile = { title: '', displayName: 'Synthetic Patient', phone: '+919876543210', dateOfBirth: '', gender: '', maritalStatus: '', addressLine1: '', city: '', state: '', postalCode: '', emergencyContactName: '', emergencyContactPhone: '' };
const account = { accountUid: uid, displayName: 'Synthetic Account', active: true };
const accountApi = (patch = {}) => ({ get: vi.fn(async () => account), initialize: vi.fn(async () => account), ...patch });
const patientApi = (patch = {}) => ({
  listPatients: vi.fn(async () => [{ patientId, displayName: 'Synthetic Patient', uhid: 'TEST-ONLY', relationship: 'self' }]),
  getProfile: vi.fn(async () => ({ patientId, uhid: 'TEST-ONLY', relationship: 'self', updatedAt, ...profile })),
  getHealth: vi.fn(async () => ({ patientId, updatedAt, profile: { bloodGroup: '', allergies: '', currentMedications: '', healthNotes: '' } })),
  saveProfile: vi.fn(async () => ({ saved: true })), saveHealth: vi.fn(async () => ({ saved: true })),
  appointments: vi.fn(async () => ({ appointments: [], nextCursor: null })), acceptLink: vi.fn(async () => ({ linked: true })),
  ...patch,
});
const securityApi = (patch = {}) => ({ changePassword: vi.fn(async () => ({ changed: true })), sendReset: vi.fn(async () => ({ sent: true })), ...patch });
const recordsFieldset = () => document.querySelector('fieldset[aria-label="Patient records"]');
afterEach(cleanup);

test('the module demands a verified signed-in account before any account or record call', () => {
  const accounts = accountApi();
  render(<SqlPatientModule accountUid="" accountApi={accounts} />);
  expect(screen.getByRole('alert').textContent).toContain('Sign in with a verified patient account.');
  expect(accounts.get).not.toHaveBeenCalled();
});

test('B007: initialization failure stays uncertain, disables the form and reload discards the edited name', async () => {
  const accounts = accountApi({ get: vi.fn(async () => null) });
  render(<SqlPatientModule accountUid={uid} accountApi={accounts} patientApi={patientApi()} securityApi={securityApi()} />);
  await screen.findByText(/Set up your account label/);
  expect(screen.getByText(/does not register a patient, match contact details/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Account name'), { target: { value: 'Synthetic Label' } });
  accounts.initialize.mockRejectedValueOnce(new Error('synthetic lost receipt'));
  fireEvent.click(screen.getByText('Initialize account'));
  await screen.findByText(/Initialization could not be confirmed/);
  expect(accounts.initialize).toHaveBeenCalledTimes(1);
  expect(accounts.initialize.mock.calls[0][0]).toBe(uid);
  expect(accounts.initialize.mock.calls[0][2]).toMatch(/^[0-9a-f-]{36}$/);
  expect(screen.getByLabelText('Account name').disabled).toBe(true);
  expect(screen.getByText('Initialize account').closest('button').disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /Reload account status/ }));
  await waitFor(() => expect(accounts.get).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByLabelText('Account name').value).toBe(''));
  expect(screen.getByLabelText('Account name').disabled).toBe(false);
});

test('B007: a confirmed initialization shows the account and mounts the record panels', async () => {
  const accounts = accountApi({ get: vi.fn(async () => null) });
  render(<SqlPatientModule accountUid={uid} accountApi={accounts} patientApi={patientApi()} securityApi={securityApi()} />);
  await screen.findByText(/Set up your account label/);
  fireEvent.change(screen.getByLabelText('Account name'), { target: { value: 'Synthetic Label' } });
  fireEvent.click(screen.getByText('Initialize account'));
  await screen.findByText(/Account ready: Synthetic Account/);
  expect(accounts.initialize).toHaveBeenCalledTimes(1);
  expect(await screen.findByText(/Your clinic records/)).toBeTruthy();
  expect(screen.getByText('Account security')).toBeTruthy();
});

test('B010: an account change clears workspace and security state', async () => {
  const accounts = accountApi({ get: vi.fn(async id => (id === uid ? account : new Promise(() => {}))) });
  const view = render(<SqlPatientModule accountUid={uid} accountApi={accounts} patientApi={patientApi()} securityApi={securityApi()} />);
  await screen.findByText(/Your clinic records/);
  view.rerender(<SqlPatientModule accountUid="another-synthetic-uid" accountApi={accounts} patientApi={patientApi()} securityApi={securityApi()} />);
  await screen.findByText(/Checking your SQL account/);
  expect(screen.queryByText(/Your clinic records/)).toBeNull();
  expect(screen.queryByText('Account security')).toBeNull();
  expect(accounts.get).toHaveBeenLastCalledWith('another-synthetic-uid');
});

test('B010: dirty patient-record edits suspend the security panel until discarded', async () => {
  render(<SqlPatientModule accountUid={uid} accountApi={accountApi()} patientApi={patientApi()} securityApi={securityApi()} />);
  await screen.findByText(/Your clinic records/);
  expect(screen.getByText('Account security')).toBeTruthy();
  fireEvent.change(await screen.findByLabelText('Full name'), { target: { value: 'Synthetic Edited' } });
  await screen.findByText(/Save or explicitly discard your patient-record edits before changing account security/);
  expect(screen.queryByText('Account security')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Reload latest details' }));
  fireEvent.click(await screen.findByText('Reload latest'));
  await waitFor(() => expect(screen.getByText('Account security')).toBeTruthy());
});

test('B010: a busy security request disables the patient-record panel', async () => {
  let release;
  const security = securityApi();
  security.changePassword.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  render(<SqlPatientModule accountUid={uid} accountApi={accountApi()} patientApi={patientApi()} securityApi={security} />);
  await screen.findByText(/Your clinic records/);
  expect(recordsFieldset().disabled).toBe(false);
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'OldPass!1' } });
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Str0ng!Pass1' } });
  fireEvent.click(screen.getByText('Change password and sign out'));
  await waitFor(() => expect(security.changePassword).toHaveBeenCalledTimes(1));
  expect(recordsFieldset().disabled).toBe(true);
  await release({ changed: true });
  await screen.findByText(/Password changed\. Sign in again/);
  expect(recordsFieldset().disabled).toBe(false);
});
