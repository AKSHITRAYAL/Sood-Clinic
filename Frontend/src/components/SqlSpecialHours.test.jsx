// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
vi.mock('../lib/firebase', () => ({ functions: {}, auth: {}, firebaseApp: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => vi.fn() }));
import SqlSpecialHours from './SqlSpecialHours';

const date = '2026-10-20';
const updatedAt = '2026-10-20T04:00:00.000000Z';
const record = (patch = {}) => ({
  doctorId: 'DOC-71', doctorName: 'Synthetic Doctor', date, timezone: 'Asia/Kolkata', updatedAt,
  exception: { kind: 'extra', sessions: [{ startMinute: 540, endMinute: 660 }] },
  ...patch,
});
const deferred = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };
const errorOf = code => Object.assign(new Error(`synthetic ${code}`), { code });
afterEach(cleanup);

test('only a current administrator or explicitly scoped doctor reaches the editor', () => {
  const api = { get: vi.fn(), save: vi.fn() };
  for (const props of [
    { accountUid: '', role: 'admin' },
    { accountUid: 'u1', role: 'manager' },
    { accountUid: 'u1', role: 'patient' },
    { accountUid: 'u1', role: 'doctor' },
  ]) {
    render(<SqlSpecialHours {...props} api={api} />);
    expect(screen.getByRole('alert').textContent).toBe('Current administrator or assigned doctor access is required.');
    cleanup();
  }
  render(<SqlSpecialHours accountUid="u1" role="doctor" assignedDoctorId="DOC-71" api={api} />);
  const doctorInput = screen.getByLabelText('Doctor ID');
  expect(doctorInput.value).toBe('DOC-71');
  expect(doctorInput.readOnly).toBe(true);
  expect(screen.getByRole('heading', { name: 'Special clinic hours' })).toBeTruthy();
  expect(api.get).not.toHaveBeenCalled();
  expect(api.save).not.toHaveBeenCalled();
});

test('loading renders the recorded exception windows and mode for that exact date', async () => {
  const api = { get: vi.fn(async () => record({ exception: { kind: 'replace', sessions: [{ startMinute: 540, endMinute: 660 }, { startMinute: 780, endMinute: 840 }] } })), save: vi.fn() };
  render(<SqlSpecialHours accountUid="u1" role="admin" api={api} />);
  fireEvent.change(screen.getByLabelText('Doctor ID'), { target: { value: 'DOC-71' } });
  const dateInput = screen.getByLabelText('Clinic date (IST)');
  expect(dateInput.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  fireEvent.change(dateInput, { target: { value: date } });
  fireEvent.click(screen.getByText('Load / reload special hours'));
  await screen.findByText('Synthetic Doctor · 2026-10-20');
  expect(api.get).toHaveBeenCalledWith('DOC-71', date);
  expect(screen.getByLabelText('How these hours apply').value).toBe('replace');
  expect(screen.getAllByLabelText('Start').map(input => input.value)).toEqual(['09:00', '13:00']);
  expect(screen.getAllByLabelText('End').map(input => input.value)).toEqual(['11:00', '14:00']);
});

test('a day without an exception invents no hours and refuses an empty save', async () => {
  const api = { get: vi.fn(async () => record({ exception: null })), save: vi.fn() };
  render(<SqlSpecialHours accountUid="u1" role="admin" api={api} />);
  fireEvent.change(screen.getByLabelText('Doctor ID'), { target: { value: 'DOC-71' } });
  fireEvent.change(screen.getByLabelText('Clinic date (IST)'), { target: { value: date } });
  fireEvent.click(screen.getByText('Load / reload special hours'));
  await screen.findByText(/No special-hours exception is recorded for this date/);
  expect(screen.queryAllByLabelText('Start')).toHaveLength(0);
  expect(screen.getByLabelText('How these hours apply').value).toBe('');
  expect(screen.getByText('Save special hours').closest('button').disabled).toBe(true);
});

test('a closed day is readable but never editable from this editor', async () => {
  const api = { get: vi.fn(async () => record({ exception: { kind: 'closed', sessions: [] } })), save: vi.fn() };
  render(<SqlSpecialHours accountUid="u1" role="admin" api={api} />);
  fireEvent.change(screen.getByLabelText('Doctor ID'), { target: { value: 'DOC-71' } });
  fireEvent.change(screen.getByLabelText('Clinic date (IST)'), { target: { value: date } });
  fireEvent.click(screen.getByText('Load / reload special hours'));
  await screen.findByText(/This day is closed\. Use the appointment-impact workflow/);
  expect(screen.queryByText('Save special hours')).toBeNull();
  expect(screen.queryByLabelText('How these hours apply')).toBeNull();
  const form = document.querySelector('form');
  fireEvent.submit(form);
  expect(api.save).not.toHaveBeenCalled();
});

test('saving sends only the frozen payload and then requires a reload before the next edit', async () => {
  const api = { get: vi.fn(async () => record()), save: vi.fn(async () => ({ saved: true, receipt: 'must-not-leak' })) };
  render(<SqlSpecialHours accountUid="u1" role="admin" api={api} />);
  fireEvent.change(screen.getByLabelText('Doctor ID'), { target: { value: 'DOC-71' } });
  fireEvent.change(screen.getByLabelText('Clinic date (IST)'), { target: { value: date } });
  fireEvent.click(screen.getByText('Load / reload special hours'));
  await screen.findByText('Synthetic Doctor · 2026-10-20');
  fireEvent.change(screen.getByLabelText('How these hours apply'), { target: { value: 'extra' } });
  fireEvent.click(screen.getByText('Add session'));
  fireEvent.change(screen.getAllByLabelText('Start')[1], { target: { value: '18:00' } });
  fireEvent.change(screen.getAllByLabelText('End')[1], { target: { value: '19:30' } });
  fireEvent.click(screen.getByText('Save special hours'));
  await screen.findByText(/Special hours saved\. Reload the latest schedule before editing again/);
  const payload = api.save.mock.calls[0][0];
  expect(payload).toEqual({
    doctorId: 'DOC-71', date, kind: 'extra',
    sessions: [{ startMinute: 540, endMinute: 660 }, { startMinute: 1080, endMinute: 1170 }],
    expectedUpdatedAt: updatedAt, requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
  });
  expect(Object.keys(payload).sort()).toEqual(['date', 'doctorId', 'expectedUpdatedAt', 'kind', 'requestId', 'sessions']);
  expect(JSON.stringify(payload)).not.toMatch(/receipt|doctorName|timezone/i);
  expect(document.querySelectorAll('fieldset[disabled]').length).toBeGreaterThan(0);
  expect(screen.getByText('Save special hours').closest('button').disabled).toBe(true);
});

test('an unconfirmed save keeps the same request ID while a validation rejection frees a fresh one', async () => {
  const api = { get: vi.fn(async () => record()), save: vi.fn() };
  api.save.mockRejectedValueOnce(new Error('synthetic lost ack')).mockResolvedValueOnce({ saved: true });
  render(<SqlSpecialHours accountUid="u1" role="admin" api={api} />);
  fireEvent.change(screen.getByLabelText('Doctor ID'), { target: { value: 'DOC-71' } });
  fireEvent.change(screen.getByLabelText('Clinic date (IST)'), { target: { value: date } });
  fireEvent.click(screen.getByText('Load / reload special hours'));
  await screen.findByText('Synthetic Doctor · 2026-10-20');
  fireEvent.click(screen.getByText('Save special hours'));
  await screen.findByText(/Save could not be confirmed/);
  fireEvent.click(screen.getByText('Retry unchanged save'));
  await screen.findByText(/Special hours saved/);
  expect(api.save).toHaveBeenCalledTimes(2);
  expect(api.save.mock.calls[1][0]).toEqual(api.save.mock.calls[0][0]);

  cleanup();
  const retry = { get: vi.fn(async () => record()), save: vi.fn(async () => { throw errorOf('functions/invalid-argument'); }) };
  render(<SqlSpecialHours accountUid="u1" role="admin" api={retry} />);
  fireEvent.change(screen.getByLabelText('Doctor ID'), { target: { value: 'DOC-71' } });
  fireEvent.change(screen.getByLabelText('Clinic date (IST)'), { target: { value: date } });
  fireEvent.click(screen.getByText('Load / reload special hours'));
  await screen.findByText('Synthetic Doctor · 2026-10-20');
  fireEvent.click(screen.getByText('Save special hours'));
  await screen.findByText(/Choose a mode and one to four valid sessions/);
  expect(screen.queryByText('Retry unchanged save')).toBeNull();
  expect(screen.getByText('Save special hours').closest('button').disabled).toBe(false);
});

test('a permission failure clears the loaded day instead of leaving stale hours on screen', async () => {
  const api = { get: vi.fn(async () => record()), save: vi.fn(async () => { throw errorOf('functions/permission-denied'); }) };
  render(<SqlSpecialHours accountUid="u1" role="admin" api={api} />);
  fireEvent.change(screen.getByLabelText('Doctor ID'), { target: { value: 'DOC-71' } });
  fireEvent.change(screen.getByLabelText('Clinic date (IST)'), { target: { value: date } });
  fireEvent.click(screen.getByText('Load / reload special hours'));
  await screen.findByText('Synthetic Doctor · 2026-10-20');
  fireEvent.click(screen.getByText('Save special hours'));
  await screen.findByText(/Save could not be confirmed/);
  await waitFor(() => expect(screen.queryByText('Synthetic Doctor · 2026-10-20')).toBeNull());
  expect(screen.queryAllByLabelText('Start')).toHaveLength(0);
});

test('unsaved edits require confirmation before a reload discards them', async () => {
  const api = { get: vi.fn(async () => record()), save: vi.fn() };
  render(<SqlSpecialHours accountUid="u1" role="admin" api={api} />);
  fireEvent.change(screen.getByLabelText('Doctor ID'), { target: { value: 'DOC-71' } });
  fireEvent.change(screen.getByLabelText('Clinic date (IST)'), { target: { value: date } });
  fireEvent.click(screen.getByText('Load / reload special hours'));
  await screen.findByText('Synthetic Doctor · 2026-10-20');
  fireEvent.change(screen.getAllByLabelText('Start')[0], { target: { value: '10:00' } });
  fireEvent.click(screen.getByText('Load / reload special hours'));
  await screen.findByText('Reload special hours?');
  expect(api.get).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Cancel'));
  expect(screen.getAllByLabelText('Start')[0].value).toBe('10:00');
  fireEvent.click(screen.getByText('Load / reload special hours'));
  await screen.findByText('Reload special hours?');
  fireEvent.click(screen.getByText('Reload'));
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getAllByLabelText('Start')[0].value).toBe('09:00'));
});

test('an unmounted editor ignores a late response', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const pending = deferred();
  const api = { get: vi.fn(() => pending.promise), save: vi.fn() };
  const view = render(<SqlSpecialHours accountUid="u1" role="admin" api={api} />);
  fireEvent.change(screen.getByLabelText('Doctor ID'), { target: { value: 'DOC-71' } });
  fireEvent.change(screen.getByLabelText('Clinic date (IST)'), { target: { value: date } });
  fireEvent.click(screen.getByText('Load / reload special hours'));
  await screen.findByText('Working…');
  view.unmount();
  pending.resolve(record());
  await new Promise(resolve => setTimeout(resolve, 0));
  pending.reject(errorOf('functions/permission-denied'));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});
