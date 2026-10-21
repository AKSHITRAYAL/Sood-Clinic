// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
vi.mock('../lib/firebase', () => ({ functions: {}, auth: {}, firebaseApp: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => vi.fn() }));
import SqlPatientWorkspace, { PatientForm } from './SqlPatientWorkspace';

const patientId = '50000000-0000-4000-8000-000000000001';
const updatedAt = '2026-10-20T00:00:00.123456Z';
const profile = { title: '', displayName: 'Synthetic Patient', phone: '+919876543210', dateOfBirth: '', gender: '', maritalStatus: '', addressLine1: '', city: '', state: '', postalCode: '', emergencyContactName: '', emergencyContactPhone: '' };
const errorOf = (code, message = `synthetic ${code}`) => Object.assign(new Error(message), { code });
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
const hooks = (onDirtyChange = vi.fn(), onBusyChange = vi.fn()) => ({ onDirtyChange, onBusyChange });
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
afterEach(cleanup);

test('PatientForm loads, tracks dirty state, saves with a fresh request ID and reloads', async () => {
  const api = formApi(); const { onDirtyChange } = hooks();
  render(<PatientForm patientId={patientId} kind="profile" api={api} {...hooks(onDirtyChange)} />);
  await screen.findByText(/Clinic ID: TEST-ONLY/);
  expect(onDirtyChange).toHaveBeenCalledWith(false);
  type('Full name', 'Synthetic Edited');
  expect(onDirtyChange).toHaveBeenCalledWith(true);
  fireEvent.click(screen.getByText('Save details'));
  await screen.findByText(/Saved\. Loading the latest record/);
  expect(api.saveProfile).toHaveBeenCalledTimes(1);
  const sent = api.saveProfile.mock.calls[0][0];
  expect(sent).toMatchObject({ patientId, expectedUpdatedAt: updatedAt, profile: expect.objectContaining({ displayName: 'Synthetic Edited' }) });
  expect(sent.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  await waitFor(() => expect(api.getProfile).toHaveBeenCalledTimes(2));
  expect(onDirtyChange).toHaveBeenLastCalledWith(false);
});

test('a validation rejection frees a fresh request ID while an unknown failure retries the same payload', async () => {
  const api = formApi({ saveProfile: vi.fn().mockRejectedValueOnce(errorOf('functions/invalid-argument')) });
  render(<PatientForm patientId={patientId} kind="profile" api={api} {...hooks()} />);
  await screen.findByText(/Clinic ID: TEST-ONLY/);
  type('Full name', 'Synthetic First');
  fireEvent.click(screen.getByText('Save details'));
  await screen.findByText(/Check the entered details/);
  type('Full name', 'Synthetic Corrected');
  fireEvent.click(screen.getByText('Save details'));
  await waitFor(() => expect(api.saveProfile).toHaveBeenCalledTimes(2));
  const [first, second] = api.saveProfile.mock.calls.map(call => call[0]);
  expect(second.profile.displayName).toBe('Synthetic Corrected');
  expect(second.requestId).not.toBe(first.requestId);
  cleanup();

  const uncertain = formApi({ saveProfile: vi.fn().mockRejectedValueOnce(new Error('synthetic unknown outcome')).mockResolvedValueOnce({ saved: true }) });
  render(<PatientForm patientId={patientId} kind="profile" api={uncertain} {...hooks()} />);
  await screen.findByText(/Clinic ID: TEST-ONLY/);
  type('Full name', 'Synthetic Uncertain');
  fireEvent.click(screen.getByText('Save details'));
  await screen.findByText('Retry unchanged save');
  screen.getByText('Retry unchanged save').closest('button').click();
  await waitFor(() => expect(uncertain.saveProfile).toHaveBeenCalledTimes(2));
  expect(uncertain.saveProfile.mock.calls[1][0]).toEqual(uncertain.saveProfile.mock.calls[0][0]);
  cleanup();

  const denied = formApi({ saveProfile: vi.fn().mockRejectedValue(errorOf('functions/permission-denied')) });
  render(<PatientForm patientId={patientId} kind="profile" api={denied} {...hooks()} />);
  await screen.findByText(/Clinic ID: TEST-ONLY/);
  type('Full name', 'Synthetic Denied');
  fireEvent.click(screen.getByText('Save details'));
  await screen.findByText(/Access is unavailable/);
  expect(screen.queryByLabelText('Full name')).toBeNull();
});

test('a beforeunload warning guards unsaved edits and is removed after save and unmount', async () => {
  const api = formApi();
  const view = render(<PatientForm patientId={patientId} kind="profile" api={api} {...hooks()} />);
  await screen.findByText(/Clinic ID: TEST-ONLY/);
  const blocked = () => !window.dispatchEvent(new Event('beforeunload', { cancelable: true }));
  expect(blocked()).toBe(false);
  type('Full name', 'Synthetic Warning');
  expect(blocked()).toBe(true);
  fireEvent.click(screen.getByText('Save details'));
  await screen.findByText(/Saved\. Loading the latest record/);
  await waitFor(() => expect(api.getProfile).toHaveBeenCalledTimes(2));
  expect(blocked()).toBe(false);
  type('Full name', 'Synthetic Warning Again');
  expect(blocked()).toBe(true);
  view.unmount();
  expect(blocked()).toBe(false);
});

test('reload confirmation discards dirty edits and refetches the record', async () => {
  const api = formApi();
  render(<PatientForm patientId={patientId} kind="profile" api={api} {...hooks()} />);
  await screen.findByText(/Clinic ID: TEST-ONLY/);
  type('Full name', 'Synthetic Will Discard');
  fireEvent.click(screen.getByText('Reload latest details'));
  const dialog = await screen.findByRole('dialog');
  expect(dialog.textContent).toContain('Unsaved edits will be discarded');
  expect(api.getProfile).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Reload latest'));
  await waitFor(() => expect(api.getProfile).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByDisplayValue('Synthetic Patient')).toBeTruthy());
});

test('the account view gates guardian health access, hides code fields and confirms dirty navigation', async () => {
  const api = formApi({
    listPatients: vi.fn(async () => [{ patientId, displayName: 'Synthetic Guardian Ward', uhid: 'TEST-ONLY', relationship: 'guardian' }]),
    getProfile: vi.fn(async () => ({ patientId, uhid: 'TEST-ONLY', relationship: 'guardian', updatedAt, ...profile, displayName: 'Synthetic Guardian Ward' })),
  });
  const onEditingChange = vi.fn();
  render(<SqlPatientWorkspace accountUid="synthetic-uid" api={api} onEditingChange={onEditingChange} />);
  await screen.findByDisplayValue('Synthetic Guardian Ward');
  const healthTab = screen.getByRole('button', { name: 'Health profile' });
  expect(healthTab.disabled).toBe(true);
  expect(screen.getByText(/Guardian clinical access is not enabled/)).toBeTruthy();
  expect(screen.getByLabelText(/Clinic-issued code/).type).toBe('password');
  fireEvent.click(screen.getByRole('button', { name: 'Personal details' }));
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Synthetic Edited' } });
  expect(screen.getByLabelText(/Clinic-issued code/).disabled).toBe(true);
  expect(screen.getByText(/Save or discard your record edits before linking another patient/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Appointments' }));
  const dialog = await screen.findByRole('dialog');
  expect(dialog.textContent).toContain('Discard these edits');
  expect(api.appointments).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('Discard edits'));
  await waitFor(() => expect(api.appointments).toHaveBeenCalledWith(patientId));
});

test('the workspace demands a signed-in account before touching any data', () => {
  const api = formApi();
  render(<SqlPatientWorkspace accountUid="" api={api} />);
  expect(screen.getByRole('alert').textContent).toContain('Sign in to access patient records.');
  expect(api.listPatients).not.toHaveBeenCalled();
});
