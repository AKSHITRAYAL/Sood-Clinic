// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getBookingCatalog: vi.fn(),
  getAvailability: vi.fn(),
  createBooking: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({ auth: { currentUser: null }, authReady: Promise.resolve(), firestore: {}, functions: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: (_functions, name) => (name === 'getAvailability' ? mocks.getAvailability : mocks.createBooking) }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})), getDoc: mocks.getDoc,
  setDoc: mocks.setDoc, addDoc: mocks.addDoc, updateDoc: mocks.updateDoc,
}));
vi.mock('../services/bookingCatalogService', () => ({ getBookingCatalog: mocks.getBookingCatalog }));
vi.mock('../components/Navbar', () => ({ default: () => null }));
vi.mock('../components/Footer', () => ({ default: () => null }));
import Bookappointment from './Bookappointment';

const catalog = {
  branches: [{ id: 'br-1', name: 'Panchkula' }],
  departments: [{ id: 'dep-1', branchId: 'br-1', name: 'Gastroenterology' }],
  doctors: [{ id: 'doc-1', branchId: 'br-1', departmentIds: ['dep-1'], name: 'Synthetic Doctor' }],
  booking: { bookingWindowDays: 2, visitTypes: [{ id: 'consultation', label: 'Consultation', mode: 'in_person' }] },
};
const slots = () => ({ data: { slots: [{ slotId: 'slot-a', time: '09:00' }, { slotId: 'slot-b', time: '10:00' }] } });
// An empty message models a stripped server message; the code is what the page maps.
const failure = (code, message = '') => Object.assign(new Error(message), { code: `functions/${code}` });

const openDetails = async () => {
  render(<Bookappointment />);
  await screen.findByText('09:00');
  fireEvent.click(screen.getByText('09:00'));
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.change(await screen.findByLabelText('Full name'), { target: { value: 'Synthetic Patient' } });
  fireEvent.change(screen.getByLabelText('Phone number'), { target: { value: '+919000000001' } });
  fireEvent.change(screen.getByLabelText(/Reason for visit/), { target: { value: 'Synthetic reason' } });
  fireEvent.click(screen.getByRole('checkbox'));
};

const attempt = async () => {
  fireEvent.click(screen.getByText('Confirm appointment'));
  await waitFor(() => expect(mocks.createBooking).toHaveBeenCalled());
};

const slotTimes = () => [...document.querySelectorAll('.slot-option')].map(button => button.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getBookingCatalog.mockResolvedValue(catalog);
  mocks.getAvailability.mockResolvedValue(slots());
});
afterEach(cleanup);

test('an already-taken slot is removed, the selection cleared and the entered details kept', async () => {
  mocks.createBooking.mockRejectedValueOnce(failure('already-exists'));
  await openDetails();
  await attempt();

  await screen.findByText('That time has just been booked. Please choose another slot.');
  expect(slotTimes()).toEqual(['10:00']);
  expect(screen.getByText('Continue').closest('button').disabled).toBe(true);
  expect(screen.getByText('1 of 2 · Select a date and time')).toBeTruthy();

  fireEvent.click(screen.getByText('10:00'));
  fireEvent.click(screen.getByText('Continue'));
  expect((await screen.findByLabelText('Full name')).value).toBe('Synthetic Patient');
  expect(screen.getByLabelText('Phone number').value).toBe('+919000000001');
  expect(screen.getByLabelText(/Reason for visit/).value).toBe('Synthetic reason');
});

test('a taken slot is never retried automatically and no Firestore write happens', async () => {
  mocks.createBooking.mockRejectedValueOnce(failure('already-exists'));
  await openDetails();
  await attempt();
  await screen.findByText('That time has just been booked. Please choose another slot.');
  await new Promise(resolve => setTimeout(resolve, 10));
  expect(mocks.createBooking).toHaveBeenCalledTimes(1);
  expect(mocks.setDoc).not.toHaveBeenCalled();
  expect(mocks.addDoc).not.toHaveBeenCalled();
  expect(mocks.updateDoc).not.toHaveBeenCalled();
});

test('per-phone cap and throttle use the server copy, or a call-the-clinic fallback when stripped', async () => {
  mocks.createBooking.mockRejectedValueOnce(failure('resource-exhausted', 'This phone number already has the maximum number of upcoming bookings.'));
  await openDetails();
  await attempt();
  await screen.findByText('This phone number already has the maximum number of upcoming bookings.');
  expect(slotTimes()).toEqual(['09:00', '10:00']);

  cleanup();
  await openDetails();
  mocks.createBooking.mockRejectedValueOnce(failure('resource-exhausted'));
  await attempt();
  await screen.findByText('You have reached the online booking limit. Please call the clinic to book.');
  expect(slotTimes()).toEqual(['09:00', '10:00']);
});

test('other failures explain themselves without mutating the slot grid', async () => {
  for (const [code, message] of [
    ['failed-precondition', 'That time is no longer available. Please choose another slot.'],
    ['unavailable', 'Booking is temporarily unavailable. Please call the clinic or try again shortly.'],
    ['internal', 'We could not reserve this time. Please try again.'],
  ]) {
    mocks.createBooking.mockRejectedValueOnce(failure(code, message));
    await openDetails();
    await attempt();
    await screen.findByText(message);
    expect(slotTimes()).toEqual(['09:00', '10:00']);
    cleanup();
  }
});

test('a successful booking renders the server reference and drops only the booked slot', async () => {
  mocks.createBooking.mockResolvedValue({ data: { reference: 'SC-ABC123' } });
  await openDetails();
  const payload = { doctorId: 'doc-1', visitTypeId: 'consultation', patient: expect.objectContaining({ name: 'Synthetic Patient' }) };
  await attempt();

  await screen.findByText(/Reference: SC-ABC123/);
  expect(slotTimes()).toEqual(['10:00']);
  expect(mocks.createBooking.mock.calls[0][0]).toEqual(expect.objectContaining(payload));
  expect(mocks.createBooking.mock.calls[0][0].clientRequestId).toBeTruthy();
});
