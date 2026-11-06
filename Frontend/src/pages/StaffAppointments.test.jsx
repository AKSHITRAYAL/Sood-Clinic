// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const api = vi.hoisted(() => ({ list: vi.fn(), transition: vi.fn() }));
vi.mock('../components/StaffLayout', () => ({ default: ({ children }) => children }));
vi.mock('../lib/staffSessionContext', () => ({ useStaffAccess: () => ({ role: 'manager', state: 'allowed' }) }));
vi.mock('../services/appointmentService', () => ({ listStaffAppointments: api.list, transitionAppointment: api.transition }));
import StaffAppointments from './StaffAppointments';
import { getAppointmentActions } from '../lib/appointmentActions';

const appointment = (id, startsAt, status = 'scheduled') => ({
  id, reference: `SC-${id}`, startsAt, endsAt: startsAt, status, visitMode: 'in_person',
  patientSnapshot: { name: `Patient ${id}`, phone: '9876543210' },
});

beforeEach(() => {
  vi.clearAllMocks();
  api.transition.mockResolvedValue({ ok: true });
  api.list.mockResolvedValue({ appointments: [appointment('morning', '2026-11-06T04:30:00.000Z')], nextCursor: null });
});
afterEach(cleanup);

test('loads real staff appointments and groups them by IST time of day', async () => {
  api.list.mockResolvedValue({ appointments: [
    appointment('morning', '2026-11-06T04:30:00.000Z'),
    appointment('evening', '2026-11-06T12:30:00.000Z', 'in_consultation'),
  ], nextCursor: null });
  render(<StaffAppointments />);
  expect(await screen.findByText('Patient morning')).toBeTruthy();
  expect(screen.getByText('Patient evening')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Morning' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Evening' })).toBeTruthy();
  expect(screen.queryByText('Waiting list')).toBeNull();
  expect(api.list).toHaveBeenCalledTimes(1);
  expect(api.list.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test('selecting a calendar date requests that date and shows an honest empty state', async () => {
  api.list.mockResolvedValueOnce({ appointments: [appointment('morning', '2026-11-06T04:30:00.000Z')], nextCursor: null })
    .mockResolvedValueOnce({ appointments: [], nextCursor: null });
  render(<StaffAppointments />);
  await screen.findByText('Patient morning');
  fireEvent.click(screen.getByRole('button', { name: /November 7,/ }));
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), null));
  expect(await screen.findByText('No appointments are scheduled for this date.')).toBeTruthy();
});

test('shows backend errors without presenting them as an empty appointment day', async () => {
  api.list.mockRejectedValue(new Error('Appointments could not be loaded. Please retry.'));
  render(<StaffAppointments />);
  expect((await screen.findByRole('alert')).textContent).toContain('Appointments could not be loaded. Please retry.');
  expect(screen.queryByText('No appointments are scheduled for this date.')).toBeNull();
});

test('passes the server cursor when advancing to the next appointment page', async () => {
  const nextCursor = { dateKey: '2026-11-06', id: 'last', seconds: 1793940000, nanoseconds: 0 };
  api.list.mockResolvedValueOnce({ appointments: [appointment('first', '2026-11-06T04:30:00.000Z')], nextCursor })
    .mockResolvedValueOnce({ appointments: [appointment('second', '2026-11-06T05:00:00.000Z')], nextCursor: null });
  render(<StaffAppointments />);
  await screen.findByText('Patient first');
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(await screen.findByText('Patient second')).toBeTruthy();
  expect(api.list).toHaveBeenLastCalledWith(expect.any(String), nextCursor);
});

test('shows only role-authorized lifecycle actions and keeps the no-show grace window', () => {
  const row = { ...appointment('a', '2026-11-06T04:30:00.000Z'), dateKey: '2026-11-06' };
  expect(getAppointmentActions(row, 'receptionist', '2026-11-06')).toEqual([]);
  expect(getAppointmentActions(row, 'manager', '2026-11-06', Date.parse(row.startsAt)).map((action) => action.to)).toEqual(['confirmed', 'checked_in', 'cancelled']);
  expect(getAppointmentActions(row, 'manager', '2026-11-06', Date.parse(row.startsAt) + 14 * 60_000).map((action) => action.to)).not.toContain('no_show');
  expect(getAppointmentActions(row, 'manager', '2026-11-06', Date.parse(row.startsAt) + 15 * 60_000).map((action) => action.to)).toContain('no_show');
  expect(getAppointmentActions({ ...row, status: 'checked_in' }, 'doctor', '2026-11-06').map((action) => action.to)).toEqual(['in_consultation']);
});

test('runs an authorized transition through the server callable and refreshes the queue', async () => {
  render(<StaffAppointments />);
  await screen.findByText('Patient morning');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(api.transition).toHaveBeenCalledWith('morning', 'confirmed', ''));
  await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
});
