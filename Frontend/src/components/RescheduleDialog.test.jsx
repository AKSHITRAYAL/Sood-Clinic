// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rescheduleStaffAppointment: vi.fn() }));
vi.mock('../services/appointmentService', () => ({ rescheduleStaffAppointment: mocks.rescheduleStaffAppointment }));
import RescheduleDialog from './RescheduleDialog';

const appointment = { id: 'apt-1', status: 'scheduled', doctorId: 'brig-ak-sood', dateKey: '2026-10-24' };
const renderDialog = (props = {}) => render(
  <RescheduleDialog open appointment={appointment} onClose={() => {}} onDone={() => {}} {...props} />,
);

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

test('a blank or malformed time never reaches the server', async () => {
  renderDialog();
  fireEvent.click(screen.getByText('Reschedule'));
  await screen.findByText('Enter the new time as HH:mm in IST.');
  expect(mocks.rescheduleStaffAppointment).not.toHaveBeenCalled();
});

test('submitting sends the appointment id, the chosen date and the IST time', async () => {
  mocks.rescheduleStaffAppointment.mockResolvedValue({ data: { dateKey: '2026-10-25', time: '09:20', status: 'scheduled' } });
  const onDone = vi.fn();
  renderDialog({ onDone });
  fireEvent.change(screen.getByLabelText('New clinic date'), { target: { value: '2026-10-25' } });
  fireEvent.change(screen.getByLabelText('New time (IST)'), { target: { value: '09:20' } });
  fireEvent.click(screen.getByText('Reschedule'));

  await waitFor(() => expect(onDone).toHaveBeenCalledWith('Appointment moved to 2026-10-25 at 09:20. The patient keeps the same reference.'));
  expect(mocks.rescheduleStaffAppointment).toHaveBeenCalledWith('apt-1', '2026-10-25', '09:20');
  expect(Object.keys(mocks.rescheduleStaffAppointment.mock.calls[0])).toHaveLength(3);
});

test('a refused slot shows the server explanation and stays open for another try', async () => {
  mocks.rescheduleStaffAppointment.mockRejectedValueOnce(Object.assign(new Error('That time has just been booked. Please choose another slot.'), { code: 'functions/already-exists' }));
  const onDone = vi.fn();
  renderDialog({ onDone });
  fireEvent.change(screen.getByLabelText('New time (IST)'), { target: { value: '10:00' } });
  fireEvent.click(screen.getByText('Reschedule'));

  await screen.findByText('That time has just been booked. Please choose another slot.');
  expect(onDone).not.toHaveBeenCalled();
  expect(screen.getByText('Reschedule').closest('button').disabled).toBe(false);
  expect(screen.getByLabelText('New time (IST)').value).toBe('10:00');
});

test('the dialog line-enters an error with no message and never claims success', async () => {
  mocks.rescheduleStaffAppointment.mockRejectedValueOnce(new Error(''));
  const onDone = vi.fn();
  renderDialog({ onDone });
  fireEvent.change(screen.getByLabelText('New time (IST)'), { target: { value: '10:00' } });
  fireEvent.click(screen.getByText('Reschedule'));
  await screen.findByText('This appointment could not be rescheduled. Check the time and try again.');
  expect(onDone).not.toHaveBeenCalled();
});

test('escape and the keep-current-time button close without a request', async () => {
  const onClose = vi.fn();
  renderDialog({ onClose });
  fireEvent.keyDown(window, { key: 'Escape' });
  fireEvent.click(screen.getByText('Keep current time'));
  expect(onClose).toHaveBeenCalledTimes(2);
  expect(mocks.rescheduleStaffAppointment).not.toHaveBeenCalled();
});

test('a closed dialog renders nothing and a second submit while saving is ignored', async () => {
  const { container } = render(<RescheduleDialog open={false} appointment={appointment} onClose={() => {}} onDone={() => {}} />);
  expect(container.firstChild).toBeNull();
  cleanup();

  let resolve;
  mocks.rescheduleStaffAppointment.mockReturnValueOnce(new Promise((res) => { resolve = res; }));
  renderDialog();
  fireEvent.change(screen.getByLabelText('New time (IST)'), { target: { value: '11:00' } });
  fireEvent.click(screen.getByText('Reschedule'));
  await screen.findByText('Moving appointment…');
  fireEvent.submit(screen.getByRole('dialog').querySelector('form'));
  expect(mocks.rescheduleStaffAppointment).toHaveBeenCalledTimes(1);
  resolve({ data: {} });
});
