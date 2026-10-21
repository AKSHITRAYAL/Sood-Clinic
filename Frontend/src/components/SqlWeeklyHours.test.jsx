// @vitest-environment jsdom
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, test, vi } from 'vitest';
void React;
import React from 'react';
vi.mock('../lib/firebase', () => ({ functions: {}, auth: {}, firebaseApp: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => vi.fn() }));
import SqlWeeklyHours from './SqlWeeklyHours';

const doctorId = 'DOC-71';
const updatedAt = '2026-10-20T04:00:00.000000Z';
const record = patch => ({
  doctorId, doctorName: 'Synthetic Doctor', timezone: 'Asia/Kolkata', updatedAt,
  sessions: [{ weekday: 1, startMinute: 540, endMinute: 660 }], ...patch,
});
const errorOf = code => Object.assign(new Error(`synthetic ${code}`), { code });
beforeEach(() => { globalThis.crypto ??= { randomUUID: () => '00000000-0000-4000-8000-00000000c0de' }; });
afterEach(cleanup);
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
test('load renders sessions and a load failure shows the fail-closed alert', async () => {
  const api = { get: vi.fn(async () => record()), save: vi.fn() };
  render(<SqlWeeklyHours accountUid="u1" role="admin" api={api} />);
  fireEvent.change(screen.getByLabelText('Doctor ID'), { target: { value: doctorId } });
  fireEvent.click(screen.getByText('Load / reload hours'));
  await screen.findByRole('heading', { name: 'Synthetic Doctor' });
  expect(api.get).toHaveBeenCalledWith(doctorId);
  expect(screen.getByDisplayValue('09:00')).toBeTruthy();
  expect(screen.getByText(/No fallback clinic hours are invented/)).toBeTruthy();
  api.get.mockRejectedValueOnce(new Error('synthetic offline'));
  await screen.findByRole('alert');
  expect(screen.getByRole('alert').textContent).toContain('Weekly hours are unavailable');
test('editing then saving sends the record-bound payload and blocks further edits until reload', async () => {
  const api = { get: vi.fn(async () => record()), save: vi.fn(async () => ({ saved: true })) };
  const [start] = screen.getAllByLabelText('Start');
  fireEvent.change(start, { target: { value: '10:00' } });
  fireEvent.click(screen.getByText('Save weekly hours'));
  expect(api.save).toHaveBeenCalledTimes(1);
  const sent = api.save.mock.calls[0][0];
  expect(sent).toMatchObject({ doctorId, expectedUpdatedAt: updatedAt, sessions: [{ weekday: 1, startMinute: 600, endMinute: 660 }] });    expect(sent.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByText('Save weekly hours').closest('button').disabled).toBe(true);
    fireEvent.click(screen.getByText('Load / reload hours'));
  await screen.findByText('Reload weekly hours?');
  expect(api.get).toHaveBeenCalledTimes(1);
  const api = { get: vi.fn(async () => record()), save: vi.fn(async () => { throw errorOf('functions/permission-denied'); }) };
  expect(screen.queryByRole('heading', { name: 'Synthetic Doctor' })).toBeNull();
  cleanup();
  const fresh = { get: vi.fn(async () => record()), save: vi.fn() };
  render(<SqlWeeklyHours accountUid="u1" role="admin" api={fresh} />);
  fireEvent.change(screen.getAllByLabelText('Start')[0], { target: { value: '10:30' } });
  expect(fresh.get).toHaveBeenCalledTimes(1);
