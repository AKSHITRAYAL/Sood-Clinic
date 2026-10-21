// @vitest-environment jsdom
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, test, vi } from 'vitest';
void React;
import React from 'react';
vi.mock('../lib/firebase', () => ({ functions: {}, auth: {}, firebaseApp: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => vi.fn() }));
import SqlPatientModule from './SqlPatientModule';

const uid = 'synthetic-patient-uid';
const patientId = '50000000-0000-4000-8000-000000000001';
const updatedAt = '2026-10-20T00:00:00.123456Z';
const profile = { title: '', displayName: 'Synthetic Patient', phone: '+919876543210', dateOfBirth: '', gender: '', maritalStatus: '', addressLine1: '', city: '', state: '', postalCode: '', emergencyContactName: '', emergencyContactPhone: '' };
const accountApi = (patch = {}) => ({ get: vi.fn(async () => ({ accountUid: uid, displayName: 'Synthetic Account', active: true })), initialize: vi.fn(async () => ({ accountUid: uid, displayName: 'Synthetic Account', active: true })), ...patch });
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
beforeEach(() => { globalThis.crypto ??= { randomUUID: () => '00000000-0000-4000-8000-00000000c0de' }; });
afterEach(cleanup);
test('the module demands a verified signed-in account before any account or record call', () => {
  const accounts = accountApi();
  render(<SqlPatientModule accountUid="" accountApi={accounts} />);
  expect(screen.getByRole('alert').textContent).toContain('Sign in with a verified patient account.');
  expect(accounts.get).not.toHaveBeenCalled();
test('B007: a missing account offers initialization without auto-retry and reload discards the edited name', async () => {
  const accounts = accountApi({ get: vi.fn(async () => null) });
  render(<SqlPatientModule accountUid={uid} accountApi={accounts} patientApi={patientApi()} securityApi={securityApi()} />);
  await screen.findByText(/Set up your account label/);
  expect(screen.getByText(/does not register a patient, match contact details/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Account name'), { target: { value: 'Synthetic Label' } });
  accounts.initialize.mockRejectedValueOnce(new Error('synthetic lost receipt'));
  fireEvent.click(screen.getByText('Initialize account'));
  await screen.findByText(/Initialization could not be confirmed/);
  expect(accounts.initialize).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Account name').disabled).toBe(true);
  expect(screen.getByText('Initialize account').closest('button').disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /Reload account status/ }));
  await waitFor(() => expect(accounts.get).toHaveBeenCalledTimes(2));
  expect(screen.getByLabelText('Account name').value).toBe('');
  expect(screen.getByLabelText('Account name').disabled).toBe(false);
test('B010: an account change clears workspace and security state', async () => {
  const accounts = accountApi({ get: vi.fn(async id => (id === uid ? { accountUid: uid, displayName: 'Synthetic Account', active: true } : new Promise(() => {}))) });
  const view = render(<SqlPatientModule accountUid={uid} accountApi={accounts} patientApi={patientApi()} securityApi={securityApi()} />);
  await screen.findByText(/Your clinic records/);
  view.rerender(<SqlPatientModule accountUid="another-synthetic-uid" accountApi={accounts} patientApi={patientApi()} securityApi={securityApi()} />);
  await screen.findByText(/Checking your SQL account/);
  expect(screen.queryByText(/Your clinic records/)).toBeNull();
  expect(screen.queryByText('Account security')).toBeNull();
  expect(accounts.get).toHaveBeenLastCalledWith('another-synthetic-uid');
test('B010: dirty patient-record edits suspend the security panel until discarded', async () => {
  render(<SqlPatientModule accountUid={uid} accountApi={accountApi()} patientApi={patientApi()} securityApi={securityApi()} />);
  let release; security.changePassword.mockImplementationOnce(() => new Promise(res => { release = res; }));
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'Str0ng!Pass1' } });
  fireEvent.click(screen.getByText('Change password and sign out'));
  await waitFor(() => expect(security.changePassword).toHaveBeenCalledTimes(1));
  expect(recordsFieldset().disabled).toBe(true);
  await release({ changed: true });
  await screen.findByText(/Password changed\. Sign in again/);
