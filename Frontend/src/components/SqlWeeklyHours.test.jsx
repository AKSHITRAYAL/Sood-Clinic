// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
vi.mock('../lib/firebase', () => ({ functions: {}, auth: {}, firebaseApp: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => vi.fn() }));
import SqlWeeklyHours from './SqlWeeklyHours';

const doctorId = 'DOC-71';
const updatedAt = '2026-10-20T04:00:00.000000Z';
const record = patch => ({
  doctorId, doctorName: 'Synthetic Doctor', timezone: 'Asia/Kolkata', updatedAt,
  sessions: [{ weekday: 1, startMinute: 540, endMinute: 660 }], ...patch,
});
const errorOf = (code, message = `synthetic ${code}`) => Object.assign(new Error(message), { code });
afterEach(cleanup);

const load = async api => {
  render(<SqlWeeklyHours accountUid="u1" role="admin" api={api} />);
  fireEvent.change(screen.getByLabelText('Doctor ID'), { target: { value: doctorId } });
  fireEvent.click(screen.getByText('Load / reload hours'));
  await screen.findByRole('heading', { name: 'Synthetic Doctor' });
};

test('access gate denies missing account, manager/patient roles and unscoped doctors', () => {
  const api = { get: vi.fn(), save: vi.fn() };
  for (const props of [
    { accountUid: '', role: 'admin' },
    { accountUid: 'u1', role: 'manager' },
    { accountUid: 'u1', role: 'patient' },
    { accountUid: 'u1', role: 'doctor' },
  ]) {
    render(<SqlWeeklyHours {...props} api={api} />);
    expect(screen.getByRole('alert').textContent).toBe('Current administrator or assigned doctor access is required.');
    cleanup();
  }
  expect(api.get).not.toHaveBeenCalled();
  render(<SqlWeeklyHours accountUid="u1" role="doctor" assignedDoctorId={doctorId} api={api} />);
  expect(screen.getByRole('heading', { name: 'Regular clinic hours' })).toBeTruthy();
  expect(screen.getByLabelText('Doctor ID').readOnly).toBe(true);
});

test('load renders the recorded sessions and a failure shows the fail-closed alert', async () => {
  const api = { get: vi.fn(async () => record()), save: vi.fn() };
  await load(api);
  expect(api.get).toHaveBeenCalledWith(doctorId);
  expect(screen.getByDisplayValue('09:00')).toBeTruthy();
  expect(screen.getByDisplayValue('11:00')).toBeTruthy();
  expect(screen.getByText(/No fallback clinic hours are invented/)).toBeTruthy();
  expect(screen.getByText(/Last verified/)).toBeTruthy();

  api.get.mockRejectedValueOnce(errorOf('functions/permission-denied'));
  fireEvent.click(screen.getByText('Load / reload hours'));
  await screen.findByRole('alert');
  expect(screen.getByRole('alert').textContent).toContain('Weekly hours are unavailable');
  expect(screen.queryByRole('heading', { name: 'Synthetic Doctor' })).toBeNull();
});

test('editing sends the record-bound payload and blocks further edits until reload', async () => {
  const api = { get: vi.fn(async () => record()), save: vi.fn(async () => ({ saved: true })) };
  await load(api);
  fireEvent.click(screen.getByText('Edit weekly hours'));
  fireEvent.change(screen.getAllByLabelText('Start')[0], { target: { value: '10:00' } });
  fireEvent.click(screen.getByText('Save weekly hours'));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  const sent = api.save.mock.calls[0][0];
  expect(sent).toMatchObject({ doctorId, expectedUpdatedAt: updatedAt, sessions: [{ weekday: 1, startMinute: 600, endMinute: 660 }] });
  expect(sent.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  await screen.findByText(/Saved\. Reload the record before editing again/);
  expect(screen.getByText('Edit weekly hours').closest('button').disabled).toBe(true);
  expect(screen.getByDisplayValue('10:00')).toBeTruthy();

  fireEvent.click(screen.getByText('Load / reload hours'));
  await screen.findByText('Reload weekly hours?');
  expect(api.get).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByText('Cancel'));
  expect(screen.getByRole('heading', { name: 'Synthetic Doctor' })).toBeTruthy();
  fireEvent.click(screen.getByText('Load / reload hours'));
  fireEvent.click(await screen.findByText('Reload'));
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByText('Edit weekly hours').closest('button').disabled).toBe(false));
});

test('an unconfirmed save keeps the same request ID for an idempotent retry', async () => {
  const api = { get: vi.fn(async () => record()), save: vi.fn().mockRejectedValueOnce(new Error('synthetic offline')).mockResolvedValueOnce({ saved: true }) };
  await load(api);
  fireEvent.click(screen.getByText('Edit weekly hours'));
  fireEvent.change(screen.getAllByLabelText('Start')[0], { target: { value: '10:00' } });
  fireEvent.click(screen.getByText('Save weekly hours'));
  await screen.findByText('Reload weekly hours?');
  expect(screen.getByRole('alert').textContent).toContain('Save could not be confirmed');
  fireEvent.click(screen.getByText('Cancel'));
  fireEvent.click(screen.getByText('Save weekly hours'));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
  expect(api.save.mock.calls[1][0]).toEqual(api.save.mock.calls[0][0]);
  expect(api.save.mock.calls[1][0].sessions[0].startMinute).toBe(600);
});

test('a rejected input frees the request ID and a permission failure clears the record', async () => {
  const api = {
    get: vi.fn(async () => record()),
    save: vi.fn()
      .mockRejectedValueOnce(errorOf('functions/invalid-argument', 'Enter valid weekly hours and reload the current schedule before saving.'))
      .mockRejectedValueOnce(errorOf('functions/permission-denied')),
  };
  await load(api);
  fireEvent.click(screen.getByText('Edit weekly hours'));
  fireEvent.change(screen.getAllByLabelText('Start')[0], { target: { value: '10:00' } });
  fireEvent.click(screen.getByText('Save weekly hours'));
  await screen.findByText(/Enter valid weekly hours/);
  expect(screen.getByRole('heading', { name: 'Synthetic Doctor' })).toBeTruthy();

  fireEvent.click(screen.getByText('Save weekly hours'));
  await screen.findByText(/Weekly hours are unavailable/);
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Synthetic Doctor' })).toBeNull());
  const [first, second] = api.save.mock.calls.map(call => call[0]);
  expect(first.sessions[0].startMinute).toBe(600);
  expect(second.sessions[0].startMinute).toBe(600);
  expect(second.requestId).not.toBe(first.requestId);
});
