// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getConsultationOptions: vi.fn(),
  getConsultationAvailability: vi.fn(),
  submitConsultationRequest: vi.fn(),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({ auth: { currentUser: null }, authReady: Promise.resolve(), firestore: {}, functions: {} }));
vi.mock('../services/consultationRequestService', () => ({
  consultationStatusLink: ({ reference, token }) => `/consultation-status?reference=${reference}&token=${token}`,
  getConsultationOptions: mocks.getConsultationOptions,
  getConsultationAvailability: mocks.getConsultationAvailability,
  submitConsultationRequest: mocks.submitConsultationRequest,
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => ({})), getDoc: mocks.getDoc,
  setDoc: mocks.setDoc, addDoc: mocks.addDoc, updateDoc: mocks.updateDoc,
}));
vi.mock('../components/Navbar', () => ({ default: () => null }));
vi.mock('../components/Footer', () => ({ default: () => null }));
import Bookappointment from './Bookappointment';

const options = {
  doctor: { id: 'doc-1', name: 'Synthetic Doctor' },
  bookingWindowDays: 2,
  locations: [
    { id: 'jindal-diagnostics', name: 'Jindal Diagnostics', address: 'Plot No. 195, Sector 10, Panchkula', landmark: 'Opposite Sindhi Sweets', windows: [{ start: '09:00', end: '11:00' }] },
    { id: 'dhawan-hospital', name: 'Dhawan Hospital', address: 'Plot No. 1-SP, Sector 7, Panchkula', landmark: '', windows: [{ start: '11:00', end: '15:00' }] },
  ],
  services: [
    { id: 'consult', label: 'In-clinic consultation', minutes: 30, mode: 'in_person', kind: 'consultation' },
    { id: 'video', label: 'Online video consultation', minutes: 30, mode: 'video', kind: 'consultation' },
  ],
  notifications: { portal: true, email: false },
};
const availability = () => ({ data: { slots: [{ slotId: 'slot-a', time: '09:00' }, { slotId: 'slot-b', time: '09:30' }] } });
const failure = (code, message = '') => Object.assign(new Error(message), { code: `functions/${code}` });
const renderPage = () => render(<MemoryRouter><Bookappointment /></MemoryRouter>);

const openDetails = async () => {
  renderPage();
  await screen.findByText('09:00');
  fireEvent.click(screen.getByText('09:00'));
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.change(await screen.findByLabelText('Full name'), { target: { value: 'Synthetic Patient' } });
  fireEvent.change(screen.getByLabelText(/Phone number/), { target: { value: '+919000000001' } });
  fireEvent.change(screen.getByLabelText(/Reason for visit/), { target: { value: 'Synthetic reason' } });
  fireEvent.click(screen.getByRole('checkbox'));
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getConsultationOptions.mockResolvedValue({ data: options });
  mocks.getConsultationAvailability.mockResolvedValue(availability());
});
afterEach(cleanup);

test('an in-person booking submits the chosen location, day and time and confirms it', async () => {
  mocks.submitConsultationRequest.mockResolvedValue({ data: { reference: 'CR-TEST01', status: 'confirmed', accessToken: 'token-123' } });
  await openDetails();
  fireEvent.click(screen.getByText('Confirm appointment'));

  await screen.findByText(/Appointment confirmed/);
  expect(screen.getByText(/CR-TEST01/)).toBeTruthy();
  expect(screen.getByText('View or cancel this appointment').getAttribute('href')).toBe('/consultation-status?reference=CR-TEST01&token=token-123');
  expect(mocks.getConsultationAvailability).toHaveBeenCalledWith(expect.objectContaining({
    doctorId: 'doc-1', serviceId: 'consult', locationId: 'jindal-diagnostics', dateKey: expect.any(String),
  }));
  expect(mocks.submitConsultationRequest).toHaveBeenCalledWith(expect.objectContaining({
    mode: 'in_person',
    serviceId: 'consult',
    doctorId: 'doc-1',
    locationId: 'jindal-diagnostics',
    dateKey: expect.any(String),
    time: '09:00',
    patient: expect.objectContaining({ name: 'Synthetic Patient', phone: '+919000000001', consentToTreatment: true }),
    clientRequestId: expect.any(String),
  }));
  expect(screen.getByText(/The selected time is reserved/)).toBeTruthy();
  expect(mocks.setDoc).not.toHaveBeenCalled();
  expect(mocks.addDoc).not.toHaveBeenCalled();
});

test('a video booking uses the shared calendar and confirms the chosen time', async () => {
  mocks.submitConsultationRequest.mockResolvedValue({ data: { reference: 'CR-VIDEO1', status: 'confirmed', accessToken: 'token-video' } });
  renderPage();
  await screen.findByLabelText('Consultation type');
  fireEvent.change(screen.getByLabelText('Consultation type'), { target: { value: 'video' } });
  await screen.findByText('09:00');
  fireEvent.click(screen.getByText('09:00'));
  fireEvent.click(screen.getByText('Continue'));
  fireEvent.change(await screen.findByLabelText('Full name'), { target: { value: 'Synthetic Patient' } });
  fireEvent.change(screen.getByLabelText(/Email address/), { target: { value: 'guest@example.com' } });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByText('Confirm appointment'));

  await screen.findByText(/Online consultation confirmed/);
  const payload = mocks.submitConsultationRequest.mock.calls[0][0];
  expect(payload).toMatchObject({ mode: 'video', serviceId: 'video', locationId: null });
  expect(payload.dateKey).toEqual(expect.any(String));
  expect(payload.time).toBe('09:00');
  expect(mocks.getConsultationAvailability).toHaveBeenCalled();
});

test('an unavailable time explains itself without mutating the slot grid', async () => {
  mocks.submitConsultationRequest.mockRejectedValueOnce(failure('failed-precondition', 'That time was just taken. Please choose another time.'));
  await openDetails();
  fireEvent.click(screen.getByText('Confirm appointment'));

  await screen.findByText('That time was just taken. Please choose another time.');
  expect(screen.getByText('09:00')).toBeTruthy();
  expect(screen.getByText('09:30')).toBeTruthy();
});

test('the contact cap uses the server copy, or a call-the-clinic fallback when stripped', async () => {
  mocks.submitConsultationRequest.mockRejectedValueOnce(failure('resource-exhausted', 'You already have several requests awaiting clinic review.'));
  await openDetails();
  fireEvent.click(screen.getByText('Confirm appointment'));
  await screen.findByText('You already have several requests awaiting clinic review.');

  cleanup();
  await openDetails();
  mocks.submitConsultationRequest.mockRejectedValueOnce(failure('resource-exhausted'));
  fireEvent.click(screen.getByText('Confirm appointment'));
  await screen.findByText('You have reached the online request limit. Please call the clinic.');
});

test('a guest with neither phone nor email is stopped before the callable', async () => {
  await openDetails();
  fireEvent.change(screen.getByLabelText(/Phone number/), { target: { value: '' } });
  fireEvent.click(screen.getByText('Confirm appointment'));

  await screen.findByText('Enter a phone number or email address so the clinic can confirm your request.');
  expect(mocks.submitConsultationRequest).not.toHaveBeenCalled();
});

test('the availability read is retried for a different location', async () => {
  renderPage();
  await screen.findByText('09:00');
  fireEvent.change(screen.getByLabelText('Clinic location'), { target: { value: 'dhawan-hospital' } });
  await waitFor(() => expect(mocks.getConsultationAvailability).toHaveBeenLastCalledWith(expect.objectContaining({
    locationId: 'dhawan-hospital',
  })));
});


test('a pending request is never presented as confirmed', async () => {
  mocks.submitConsultationRequest.mockResolvedValue({ data: { reference: 'CR-PENDING', status: 'pending' } });
  await openDetails();
  fireEvent.click(screen.getByText('Confirm appointment'));
  await screen.findByText('Request submitted.');
  expect(screen.queryByText('Appointment confirmed.')).toBeNull();
});
