// @vitest-environment jsdom
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, test, vi } from 'vitest';
void React;
import React from 'react';
vi.mock('../lib/firebase', () => ({ functions: {}, auth: {}, firebaseApp: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => vi.fn() }));
import SqlPatientWorkspace, { PatientForm } from './SqlPatientWorkspace';

const patientId = '50000000-0000-4000-8000-000000000001';
const otherPatientId = '50000000-0000-4000-8000-000000000002';
const updatedAt = '2026-10-20T00:00:00.123456Z';
const profile = { title: '', displayName: 'Synthetic Patient', phone: '+919876543210', dateOfBirth: '', gender: '', maritalStatus: '', addressLine1: '', city: '', state: '', postalCode: '', emergencyContactName: '', emergencyContactPhone: '' };
const deferred = () => { let resolve; const promise = new Promise(res => { resolve = res; }); return { promise, resolve }; };
const errorOf = code => Object.assign(new Error(`synthetic ${code}`), { code });
const formApi = (patch = {}) => ({
  listPatients: vi.fn(async () => [{ patientId, displayName: 'Synthetic Patient', uhid: 'TEST-ONLY', relationship: 'self' }]),
  getProfile: vi.fn(async () => ({ patientId, uhid: 'TEST-ONLY', relationship: 'self', updatedAt, ...profile })),
  getHealth: vi.fn(async () => ({ patientId, updatedAt, profile: { bloodGroup: '', allergies: '', currentMedications: '', healthNotes: '' } })),
  saveProfile: vi.fn(async () => ({ saved: true })),
  saveHealth: vi.fn(async () => ({ saved: true })),
  appointments: vi.fn(async () => ({ appointments: [], nextCursor: null })),
  acceptLink: vi.fn(async () => ({ linked: true })),
  ...patch,
});
const dirty = (onDirtyChange = vi.fn(), onBusyChange = vi.fn()) => ({ onDirtyChange, onBusyChange });
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
beforeEach(() => { globalThis.crypto ??= { randomUUID: () => '00000000-0000-4000-8000-00000000c0de' }; });
afterEach(cleanup);
test('PatientForm loads, tracks dirty state, saves with a fresh request ID and reloads', async () => {
  const api = formApi(); const { onDirtyChange } = dirty();
  render(<PatientForm patientId={patientId} kind="profile" api={api} {...dirty(onDirtyChange)} />);
  await screen.findByText(/Clinic ID: TEST-ONLY/);
  expect(onDirtyChange).toHaveBeenCalledWith(false);
  type('Full name', 'Synthetic Edited');
  expect(onDirtyChange).toHaveBeenCalledWith(true);
  fireEvent.click(screen.getByText('Save details'));
  await screen.findByText(/Saved\. Loading the latest record/);
  expect(api.saveProfile).toHaveBeenCalledTimes(1);
  const sent = api.saveProfile.mock.calls[0][0];
  expect(sent).toMatchObject({ patientId, expectedUpdatedAt: updatedAt, profile: expect.objectContaining({ displayName: 'Synthetic Edited' }) });
  expect(sent.requestId).toMatch(/^[0-9a-f-]{36}$/);
  await waitFor(() => expect(api.getProfile).toHaveBeenCalledTimes(2));
test('validation rejection frees a fresh request ID while unknown failures retry the exact same payload', async () => {
  const api = formApi({ saveProfile: vi.fn().mockRejectedValueOnce(errorOf('functions/invalid-argument')) });
  render(<PatientForm patientId={patientId} kind="profile" api={api} {...dirty()} />);
  type('Full name', 'Synthetic First');
  await screen.findByText(/Check the entered details/);
  expect(screen.queryByRole('alert').textContent).toContain('Check the entered details');
  type('Full name', 'Synthetic Corrected');
  const first = api.saveProfile.mock.calls[0][0]; const second = api.saveProfile.mock.calls[1][0];
  expect(second.profile.displayName).toBe('Synthetic Corrected');
  cleanup();
  const uncertain = formApi({ saveProfile: vi.fn().mockRejectedValueOnce(new Error('synthetic unknown outcome')).mockResolvedValueOnce({ saved: true }) });
  render(<PatientForm patientId={patientId} kind="profile" api={uncertain} {...dirty()} />);
  type('Full name', 'Synthetic Uncertain');
  const retry = await screen.findByText('Retry unchanged save');
  fireEvent.click(retry);
  expect(aborted.saveProfile.mock.calls[1][0].requestId).not.toBe(aborted.saveProfile.mock.calls[0][0].requestId);
  const denied = formApi({ saveProfile: vi.fn().mockRejectedValue(errorOf('functions/permission-denied')) });
  render(<PatientForm patientId={patientId} kind="profile" api={denied} {...dirty()} />);
  type('Full name', 'Synthetic Denied');
  await screen.findByText(/Access is unavailable/);
  expect(screen.queryByLabelText('Full name')).toBeNull();
test('a beforeunload warning guards dirty/uncertain states and is cleaned up after save and unmount', async () => {
  await screen.findByText(/Clinic ID: OTHER-ONLY/);
  slow.resolve({ patientId, uhid: 'TEST-ONLY', relationship: 'self', updatedAt, ...profile, displayName: 'Synthetic First' });
  await new Promise(res => setTimeout(res, 10));
  expect(screen.getByDisplayValue('Synthetic Second')).toBeTruthy();
  expect(screen.queryByText(/Clinic ID: TEST-ONLY/)).toBeNull();
test('reload confirmation discards dirty edits and refetches the record', async () => {
  type('Full name', 'Synthetic Will Discard');
  const dialog = await screen.findByRole('dialog');
  expect(dialog.textContent).toContain('Unsaved edits will be discarded');
  fireEvent.click(screen.getByText('Reload latest'));
test('the account view gates guardian health access, hides code fields and confirms dirty navigation', async () => {
  const api = formApi({ listPatients: vi.fn(async () => [{ patientId, displayName: 'Synthetic Guardian Ward', uhid: 'TEST-ONLY', relationship: 'guardian' }]) });
  const { onEditingChange } = { onEditingChange: vi.fn() };
  render(<SqlPatientWorkspace accountUid="synthetic-uid" api={api} onEditingChange={onEditingChange} />);
  await screen.findByDisplayValue(/Synthetic Guardian Ward/);
  const healthTab = screen.getByRole('button', { name: 'Health profile' });
  expect(healthTab.disabled).toBe(true);
  expect(screen.getByText(/Guardian clinical access is not enabled/)).toBeTruthy();
  expect(screen.getByLabelText(/Clinic-issued code/).type).toBe('password');
  fireEvent.click(screen.getByRole('button', { name: 'Personal details' }));
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Synthetic Edited' } });
  expect(screen.getByLabelText(/Clinic-issued code/).disabled).toBe(true);
  expect(screen.getByText(/Save or discard your record edits before linking another patient/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Appointments' }));
  expect(dialog.textContent).toContain('Discard these edits');
  fireEvent.click(screen.getByText('Discard edits'));
  await waitFor(() => expect(api.appointments).toHaveBeenCalledWith(patientId));
test('the workspace demands a signed-in account before touching any data', async () => {
  render(<SqlPatientWorkspace accountUid="" api={api} />);
  expect(screen.getByRole('alert').textContent).toContain('Sign in to access patient records.');
  expect(api.listPatients).not.toHaveBeenCalled();
