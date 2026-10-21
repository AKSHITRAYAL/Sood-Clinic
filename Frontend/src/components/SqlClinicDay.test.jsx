// @vitest-environment jsdom
import React from 'react';
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
void React;
vi.mock('../lib/firebase', () => ({ functions: {}, auth: {}, firebaseApp: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => vi.fn() }));
import SqlClinicDay from './SqlClinicDay';


const date = '2026-10-20';
const day = patch => ({
  doctorId: 'DOC-71', date, doctorName: 'Synthetic Doctor', timezone: 'Asia/Kolkata', nextCursor: null,
  appointments: [{
    id: 'a0000000-0000-4000-8000-000000000001', reference: 'SYNTHETIC-DAY-001',
    startsAt: '2026-10-20T04:30:00.123456Z', endsAt: '2026-10-20T05:00:00.123456Z',
    updatedAt: '2026-10-20T04:31:00.123456Z', clinicDate: date, status: 'confirmed',
    visitMode: 'in_person', branchName: 'Synthetic Clinic', serviceName: 'Consultation',
  }], ...patch,
});
const deferred = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };
const errorOf = code => Object.assign(new Error(`synthetic ${code}`), { code });
afterEach(cleanup);


test('staff-access gate denies missing account, non-staff roles and unscoped doctors', () => {
  const api = { list: vi.fn() };
  for (const props of [
    { accountUid: '', role: 'admin' },
    { accountUid: 'u1', role: 'patient' },
    { accountUid: 'u1', role: 'doctor' },
  ]) {
    render(<SqlClinicDay {...props} api={api} />);
    expect(screen.getByRole('alert').textContent).toBe('Current staff access is required.');
    cleanup();
  }
  expect(api.list).not.toHaveBeenCalled();
  render(<SqlClinicDay accountUid="u1" role="doctor" assignedDoctorId="DOC-71" api={api} />);
  expect(screen.getByRole('heading', { name: 'Clinic day' })).toBeTruthy();
});


test('a successful load renders the operational rows and the privacy footer', async () => {
  const api = { list: vi.fn(async () => day()) };
  render(<SqlClinicDay accountUid="u1" role="admin" api={api} />);
  fireEvent.change(screen.getByLabelText('Doctor ID'), { target: { value: 'DOC-71' } });
  const dateInput = screen.getByLabelText('Clinic date (IST)');
  expect(dateInput.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  fireEvent.change(dateInput, { target: { value: date } });
  fireEvent.click(screen.getByText('Load / refresh day'));
  await screen.findByText('SYNTHETIC-DAY-001');
  expect(api.list).toHaveBeenCalledWith('DOC-71', date, null);
  expect(screen.getByText(/Patient identities, health information/)).toBeTruthy();
  expect(screen.getByText(/does not change appointment or queue state/)).toBeTruthy();
  expect(screen.queryByText('Load later appointments')).toBeNull();
});


test('the busy guard blocks duplicate loads and a permission failure clears the page', async () => {
  const pending = deferred();
  const api = { list: vi.fn(() => pending.promise) };
  const view = render(<SqlClinicDay accountUid="u1" role="admin" api={api} />);
  fireEvent.change(screen.getByLabelText('Doctor ID'), { target: { value: 'DOC-71' } });
  const form = document.querySelector('form');
  fireEvent.submit(form);
  fireEvent.submit(form);
  await screen.findByText(/Loading clinic day/);
  expect(api.list).toHaveBeenCalledTimes(1);
  pending.reject(errorOf('functions/permission-denied'));
  await screen.findByRole('alert');
  expect(screen.getByRole('alert').textContent).toContain('Clinic day is unavailable');
  expect(screen.queryByText('SYNTHETIC-DAY-001')).toBeNull();
  view.unmount();
});


test('a non-permission failure during pagination keeps the loaded page visible', async () => {
  const cursor = { startsAt: '2026-10-20T04:30:00.123456Z', reference: 'SYNTHETIC-DAY-001' };
  const api = { list: vi.fn().mockResolvedValueOnce(day({ nextCursor: cursor })).mockRejectedValueOnce(new Error('synthetic offline')) };
  render(<SqlClinicDay accountUid="u1" role="admin" api={api} />);
  fireEvent.change(screen.getByLabelText('Doctor ID'), { target: { value: 'DOC-71' } });
  fireEvent.click(screen.getByText('Load / refresh day'));
  await screen.findByText('SYNTHETIC-DAY-001');
  fireEvent.click(screen.getByText('Load later appointments'));
  await screen.findByRole('alert');
  expect(screen.getByRole('alert').textContent).toContain('Clinic day is unavailable');
  expect(screen.getByText('SYNTHETIC-DAY-001')).toBeTruthy();
});


test('a permission failure during pagination clears the page', async () => {
  const cursor = { startsAt: '2026-10-20T04:30:00.123456Z', reference: 'SYNTHETIC-DAY-001' };
  const api = { list: vi.fn().mockResolvedValueOnce(day({ nextCursor: cursor })).mockRejectedValueOnce(errorOf('functions/permission-denied')) };
  render(<SqlClinicDay accountUid="u1" role="admin" api={api} />);
  fireEvent.change(screen.getByLabelText('Doctor ID'), { target: { value: 'DOC-71' } });
  fireEvent.click(screen.getByText('Load / refresh day'));
  await screen.findByText('SYNTHETIC-DAY-001');
  fireEvent.click(screen.getByText('Load later appointments'));
  await screen.findByRole('alert');
  expect(screen.queryByText('SYNTHETIC-DAY-001')).toBeNull();
});


test('pagination appends without duplicates and refuses a repeated cursor', async () => {
  const cursor = { startsAt: '2026-10-20T04:30:00.123456Z', reference: 'SYNTHETIC-DAY-001' };
  const api = { list: vi.fn()
    .mockResolvedValueOnce(day({ nextCursor: cursor }))
    .mockResolvedValueOnce(day({ nextCursor: cursor }))
    .mockResolvedValueOnce(day({ nextCursor: cursor })) };
  render(<SqlClinicDay accountUid="u1" role="admin" api={api} />);
  fireEvent.change(screen.getByLabelText('Doctor ID'), { target: { value: 'DOC-71' } });
  fireEvent.click(screen.getByText('Load / refresh day'));
  await screen.findByText('SYNTHETIC-DAY-001');
  fireEvent.click(screen.getByText('Load later appointments'));
  await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(document.querySelectorAll('tbody tr')).toHaveLength(1));
  fireEvent.click(screen.getByText('Load later appointments'));
  await screen.findByText('The day changed. Reload before continuing.');
  expect(api.list).toHaveBeenCalledTimes(2);
  expect(document.querySelectorAll('tbody tr')).toHaveLength(1);
});


test('an unmounted view ignores a late response', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const pending = deferred();
  const api = { list: vi.fn(() => pending.promise) };
  const view = render(<SqlClinicDay accountUid="u1" role="admin" api={api} />);
  fireEvent.change(screen.getByLabelText('Doctor ID'), { target: { value: 'DOC-71' } });
  fireEvent.click(screen.getByText('Load / refresh day'));
  await screen.findByText(/Loading clinic day/);
  view.unmount();
  pending.resolve(day());
  await new Promise(res => setTimeout(res, 0));
  pending.reject(errorOf('functions/permission-denied'));
  await new Promise(res => setTimeout(res, 0));
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});
