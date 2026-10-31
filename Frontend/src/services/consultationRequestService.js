import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

// Thin callable surface for the consultation-request workflow. All validation,
// capacity, authorization and audit decisions stay on the server.
const call = (name) => httpsCallable(functions, name);

// Stable public link the clinic can send after a request or proposal. The token is
// a single-use capability scoped to one request; it is never stored in Firestore.
export const consultationStatusLink = ({ reference, token }) => `/consultation-status?reference=${encodeURIComponent(reference)}&token=${encodeURIComponent(token)}`;

export const getConsultationOptions = () => call('getConsultationOptions')();
export const getConsultationAvailability = (input) => call('getConsultationAvailability')(input);
export const submitConsultationRequest = (input) => call('submitConsultationRequest')(input);
export const getConsultationRequestStatus = (input) => call('getConsultationRequestStatus')(input);
export const cancelConsultationRequest = (input) => call('cancelConsultationRequest')(input);
export const respondToAppointmentProposal = (input) => call('respondToAppointmentProposal')(input);

export const listConsultationRequests = (input = {}) => call('listConsultationRequests')(input);
export const listConsultationProposals = (requestId) => call('listConsultationProposals')({ requestId });
export const approveConsultationRequest = (input) => call('approveConsultationRequest')(input);
export const declineConsultationRequest = (input) => call('declineConsultationRequest')(input);
export const bulkApproveConsultationRequests = (input) => call('bulkApproveConsultationRequests')(input);
export const offerAppointmentProposal = (input) => call('offerAppointmentProposal')(input);
export const expireConsultationProposals = (limit) => call('expireConsultationProposals')({ limit });
