// @vitest-environment jsdom
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, test, vi } from 'vitest';
void React;
import React from 'react';
vi.mock('../lib/firebase', () => ({ functions: {}, auth: {}, firebaseApp: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => vi.fn() }));
import SqlPatientLinkManager from './SqlPatientLinkManager';

const patientId = '50000000-0000-4000-8000-000000000001';
const uid = 'synthetic-account-uid';
const api = (patch = {}) => ({
  issue: vi.fn(async () => ({ code: 'C'.repeat(43), expiresAt: new Date(Date.now() + 600000).toISOString() })),
  revoke: vi.fn(async () => ({ revoked: true })),
  ...patch,
});
const fill = target => fireEvent.change(screen.getByLabelText('Exact Firebase Auth account ID'), { target: { value: target } });
const attest = () => fireEvent.click(screen.getByRole('checkbox'));
afterEach(cleanup);
test('B006: the editor mounts only for admin/manager staff with a selected patient', () => {
  for (const [accountUid, role, selected] of [['', 'admin', patientId], ['synthetic-uid', 'doctor', patientId], ['synthetic-uid', 'admin', '']]) {
    const { container, unmount } = render(<SqlPatientLinkManager accountUid={accountUid} role={role} patientId={selected} api={api()} />);
    expect(container.textContent).toBe('');
    unmount();
  }
test('B006: issuance requires an exact target and attestation, shows the code once, and hiding is not revoking', async () => {
  const links = api();
  render(<SqlPatientLinkManager accountUid="synthetic-uid" role="admin" patientId={patientId} api={links} />);
  const issueButton = screen.getByText('Issue clinic code').closest('button');
  expect(issueButton.disabled).toBe(true);
  fill(uid);
  attest();
  expect(issueButton.disabled).toBe(false);
  fireEvent.click(screen.getByText('Issue clinic code'));
  fireEvent.click(await screen.findByText('Issue new code'));
  const codeInput = await screen.findByLabelText('Clinic-issued one-time code');
  expect(links.issue).toHaveBeenCalledWith(patientId, uid, 'self', 'in_person_identity');
  expect(codeInput.readOnly).toBe(true);
  expect(codeInput.value).toBe('C'.repeat(43));
  expect(screen.getByText(/Do not put it in an email, log or URL/)).toBeTruthy();
  fireEvent.click(screen.getByText('Hide code'));
  expect(screen.queryByLabelText('Clinic-issued one-time code')).toBeNull();
  expect(links.revoke).not.toHaveBeenCalled();
  expect(links.issue).toHaveBeenCalledTimes(1);
test('B006: an expired code clears itself and revoke runs only through an explicit confirmation', async () => {
  const links = api({ issue: vi.fn(async () => ({ code: 'C'.repeat(43), expiresAt: new Date(Date.now() + 300).toISOString() })) });
  fill(uid); attest();
  await screen.findByLabelText('Clinic-issued one-time code');
  await waitFor(() => expect(screen.queryByLabelText('Clinic-issued one-time code')).toBeNull(), { timeout: 2000 });
  expect(screen.getByText(/This code expired/)).toBeTruthy();
  fireEvent.click(screen.getByText('Remove this SQL patient link'));
  expect(dialog.textContent).toContain('does not suspend the account or alter legacy access');
  fireEvent.click(screen.getByText('Remove link'));
  await screen.findByText(/The selected SQL patient link and pending code were removed/);
  expect(links.revoke).toHaveBeenCalledWith(patientId, uid);
test('B006: unconfirmed issue and revoke responses never claim success', async () => {
  const failing = api({ issue: vi.fn(async () => { throw new Error('synthetic issue failure'); }), revoke: vi.fn(async () => { throw new Error('synthetic revoke failure'); }) });
  render(<SqlPatientLinkManager accountUid="synthetic-uid" role="manager" patientId={patientId} api={failing} />);
