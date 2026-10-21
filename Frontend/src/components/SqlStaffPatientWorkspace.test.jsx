// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
vi.mock('../lib/firebase', () => ({ functions: {}, auth: {}, firebaseApp: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => vi.fn() }));
import SqlStaffPatientWorkspace from './SqlStaffPatientWorkspace';

const patientId = '50000000-0000-4000-8000-000000000001';
const otherPatientId = '50000000-0000-4000-8000-000000000002';
const updatedAt = '2026-10-20T00:00:00.123456Z';
const profile = { title: '', displayName: 'Synthetic Patient', phone: '+919876543210', dateOfBirth: '', gender: '', maritalStatus: '', addressLine1: '', city: '', state: '', postalCode: '', emergencyContactName: '', emergencyContactPhone: '' };
const api = (patch = {}) => ({
  search: vi.fn(async () => [{ patientId, uhid: 'TEST-ONLY', displayName: 'Synthetic Patient', phone: '+919876543210' }]),
  getProfile: vi.fn(async () => ({ patientId, uhid: 'TEST-ONLY', updatedAt, ...profile })),
  saveProfile: vi.fn(async () => ({ saved: true })),
  ...patch,
});
const linkApi = (patch = {}) => ({ issue: vi.fn(async () => ({ code: 'C'.repeat(43), expiresAt: new Date(Date.now() + 600000).toISOString() })), revoke: vi.fn(async () => ({ revoked: true })), ...patch });
afterEach(cleanup);

test('B005: only admin/manager roles mount the registry', () => {
  for (const [accountUid, role] of [['', 'admin'], ['synthetic-uid', 'doctor'], ['synthetic-uid', 'patient'], ['synthetic-uid', '']]) {
    const { unmount } = render(<SqlStaffPatientWorkspace accountUid={accountUid} role={role} api={api()} />);
    expect(screen.getByRole('alert').textContent).toContain('Current administrator or manager access is required.');
    expect(screen.queryByLabelText(/Search by/)).toBeNull();
    unmount();
  }
});

test('B005: search sends the trimmed exact key and permission failures map to a staff message', async () => {
  const service = api();
  render(<SqlStaffPatientWorkspace accountUid="synthetic-uid" role="manager" api={service} />);
  fireEvent.change(screen.getByLabelText(/Clinic ID \(case-sensitive\)/), { target: { value: '  TEST-ONLY  ' } });
  fireEvent.click(screen.getByText('Search patients'));
  await screen.findByText('Synthetic Patient');
  expect(service.search).toHaveBeenCalledWith('uhid', 'TEST-ONLY');
  expect(screen.getByText(/No name-prefix searches, full patient-directory downloads/)).toBeTruthy();
  expect(screen.getByText('TEST-ONLY')).toBeTruthy();
  cleanup();

  const denied = api({ search: vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { code: 'functions/permission-denied' })) });
  render(<SqlStaffPatientWorkspace accountUid="synthetic-uid" role="admin" api={denied} />);
  fireEvent.change(screen.getByLabelText(/Clinic ID \(case-sensitive\)/), { target: { value: 'TEST-ONLY' } });
  fireEvent.click(screen.getByText('Search patients'));
  await screen.findByText(/Current administrator or manager access is required\. Sign in again/);
  expect(screen.queryByText('Synthetic Patient')).toBeNull();
});

test('B005: dirty profile edits suspend the link manager and switching results confirms first', async () => {
  const service = api({
    search: vi.fn(async (kind, value) => [
      { patientId, uhid: 'TEST-ONLY', displayName: 'Synthetic Patient', phone: '+919876543210' },
      { patientId: otherPatientId, uhid: `OTHER-${value}`, displayName: 'Synthetic Other', phone: '+919876543211' },
    ]),
  });
  const links = linkApi();
  render(<SqlStaffPatientWorkspace accountUid="synthetic-uid" role="admin" api={service} linkApi={links} />);
  fireEvent.change(screen.getByLabelText(/Clinic ID \(case-sensitive\)/), { target: { value: 'TEST-ONLY' } });
  fireEvent.click(screen.getByText('Search patients'));
  const [openFirst] = await screen.findAllByText('Open details');
  fireEvent.click(openFirst);
  await screen.findByText(/Clinic ID: TEST-ONLY/);
  expect(screen.getByText('Verified patient-account linking')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Synthetic Edited' } });
  await screen.findByText(/Save or discard profile edits before managing patient-account links/);
  expect(screen.queryByText('Verified patient-account linking')).toBeNull();

  fireEvent.change(screen.getByLabelText(/Clinic ID \(case-sensitive\)/), { target: { value: 'TEST-ONLY' } });
  fireEvent.click(screen.getByText('Search patients'));
  const dialog = await screen.findByRole('dialog');
  expect(dialog.textContent).toContain('Discard these edits');
  expect(service.search).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Cancel'));
  expect(screen.getByDisplayValue('Synthetic Edited')).toBeTruthy();

  fireEvent.click(screen.getByText('Search patients'));
  fireEvent.click((await screen.findByRole('dialog')).querySelector('.button-danger'));
  await waitFor(() => expect(service.search).toHaveBeenCalledTimes(2));
  await screen.findByText('Synthetic Other');
  expect(service.search).toHaveBeenLastCalledWith('uhid', 'TEST-ONLY');
});
