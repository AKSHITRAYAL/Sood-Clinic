import { beforeEach, expect, test, vi } from 'vitest';

const calls = vi.hoisted(() => []);
vi.mock('../lib/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_functions, name) => (payload) => {
    calls.push({ name, payload });
    return Promise.resolve({ data: { name, payload } });
  },
}));
import {
  approveConsultationRequest,
  bulkApproveConsultationRequests,
  cancelConsultationRequest,
  consultationStatusLink,
  getConsultationAvailability,
  getConsultationOptions,
  getConsultationRequestStatus,
  listConsultationRequests,
  offerAppointmentProposal,
  respondToAppointmentProposal,
  submitConsultationRequest,
} from './consultationRequestService';

beforeEach(() => { calls.length = 0; });

test('wraps every workflow callable with its exact server name', async () => {
  const payload = { requestId: 'request-one' };
  await getConsultationOptions();
  await getConsultationAvailability(payload);
  await submitConsultationRequest(payload);
  await getConsultationRequestStatus(payload);
  await cancelConsultationRequest(payload);
  await respondToAppointmentProposal({ ...payload, token: 'token', accept: true });
  await listConsultationRequests();
  await approveConsultationRequest(payload);
  await bulkApproveConsultationRequests({ requestIds: ['request-one'] });
  await offerAppointmentProposal(payload);

  expect(calls.map((call) => call.name)).toEqual([
    'getConsultationOptions',
    'getConsultationAvailability',
    'submitConsultationRequest',
    'getConsultationRequestStatus',
    'cancelConsultationRequest',
    'respondToAppointmentProposal',
    'listConsultationRequests',
    'approveConsultationRequest',
    'bulkApproveConsultationRequests',
    'offerAppointmentProposal',
  ]);
  expect(calls[1].payload).toEqual(payload);
  expect(calls[5].payload).toEqual({ ...payload, token: 'token', accept: true });
  expect(calls[8].payload).toEqual({ requestIds: ['request-one'] });
  // An explicit default keeps the queue readable without a status argument.
  expect(calls[6].payload).toEqual({});
});

test('builds an encoded secure status link and never stores the token', () => {
  expect(consultationStatusLink({ reference: 'CR-AB12CD34', token: 'a b&c' }))
    .toBe('/consultation-status?reference=CR-AB12CD34&token=a%20b%26c');
});
