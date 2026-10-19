// Synthetic only. Never replace these values with a production export.
const at = '2026-10-19T00:00:00.000Z';
const record = (source, path, data) => ({ source, path, data });
const firestore = (path, data) => record('firestore', path, data);
const fixtures = [
  record('auth', 'fixture-account', { uid: 'fixture-account', displayName: 'Synthetic Account', emailVerified: true, disabled: false, customClaims: {} }),
  firestore('clinic/publicConfig', { bookingWindowDays: 14, leadMinutes: 30, visitTypes: [{ id: 'consultation', label: 'Synthetic consultation', minutes: 20, mode: 'in_person', feePaise: 25000 }] }),
  firestore('branches/fixture-branch', { name: 'Synthetic Branch', code: 'FIXTURE', timezone: 'Asia/Kolkata', active: true, address: { line1: 'Synthetic address', city: 'Test City', state: 'Test State', postalCode: '000000', country: 'IN' }, updatedAt: at }),
  firestore('departments/fixture-department', { branchId: 'fixture-branch', name: 'Synthetic Department', code: 'FIXTURE-DEPT', description: 'Synthetic description', active: true, publicBookingEnabled: true, sortOrder: 1, updatedAt: at }),
  firestore('doctors/fixture-doctor', { branchId: 'fixture-branch', departmentIds: ['fixture-department'], name: 'Synthetic Doctor', qualification: 'Synthetic qualification', registrationNumber: 'FIXTURE-ONLY', active: true, bookingEnabled: true, updatedAt: at }),
  firestore('patients/fixture-account', { displayName: 'Synthetic Patient', phone: '0000000000', email: 'fixture@example.test', uhid: 'SC-999999', linkedUids: ['fixture-account'], title: '', dateOfBirth: '2000-02-29', addressLine1: 'Synthetic address', allergies: 'Synthetic clinical field', updatedAt: at }),
  firestore('patientDirectory/fixture-account', { patientId: 'fixture-account', displayName: 'Synthetic Patient', linkedUids: ['fixture-account'], updatedAt: at }),
  firestore('patientIdentityLocks/fixture-lock', { patientId: 'fixture-account', createdAt: at }),
  firestore('counters/patientUhid', { value: 999999, updatedAt: at }),
  firestore('doctorSchedules/fixture-doctor', { doctorId: 'fixture-doctor', sessions: [{ weekday: 1, start: '08:00', end: '10:00' }], updatedAt: at }),
  firestore('scheduleExceptions/fixture-exception', { doctorId: 'fixture-doctor', dateKey: '2026-10-20', type: 'closed', reason: 'Synthetic closure', updatedAt: at }),
  firestore('clinicSchedules/fixture-doctor', { doctorId: 'fixture-doctor', sessions: [] }),
  firestore('appointments/fixture-appointment', { reference: 'FIXTURE-APPOINTMENT', branchId: 'fixture-branch', departmentId: 'fixture-department', doctorId: 'fixture-doctor', patientId: 'fixture-account', visitType: 'consultation', visitMode: 'in_person', dateKey: '2026-10-20', startsAt: '2026-10-20T02:30:00.000Z', endsAt: '2026-10-20T02:50:00.000Z', status: 'scheduled', patientSnapshot: { name: 'Synthetic Patient', phone: '0000000000', email: 'fixture@example.test' }, reason: 'Synthetic health text', consent: { version: 'fixture-v1', acceptedAt: at }, createdBy: { uid: 'fixture-account', role: 'patient' }, createdAt: at }),
  firestore('appointments/fixture-appointment/events/fixture-event', { from: null, to: 'scheduled', byUid: 'fixture-account', byRole: 'patient', at, meta: { source: 'patient_portal' } }),
  firestore('appointmentSlots/fixture-slot', { doctorId: 'fixture-doctor', dateKey: '2026-10-20', startsAt: '2026-10-20T02:30:00.000Z', endsAt: '2026-10-20T02:50:00.000Z', appointmentId: 'fixture-appointment', status: 'booked', createdAt: at }),
  firestore('bookingRequests/fixture-request', { appointmentId: 'fixture-appointment', reference: 'FIXTURE-APPOINTMENT', status: 'scheduled', createdAt: at }),
  firestore('patients/fixture-account/medicalHistory/fixture-history', { doctorId: 'fixture-doctor', diagnosis: 'Synthetic diagnosis', notes: 'Synthetic notes', createdAt: at }),
  firestore('patients/fixture-account/medicalDocuments/fixture-document', { doctorId: 'fixture-doctor', title: 'Synthetic document', storagePath: 'synthetic/not-a-real-file.pdf', visibleToPatient: false, createdAt: at }),
  firestore('patientFeedback/fixture-feedback', { appointmentId: 'fixture-appointment', patientId: 'fixture-account', rating: 5, comment: 'Synthetic unpublished feedback', status: 'pending', createdAt: at }),
  firestore('auditLogs/fixture-audit', { at, actor: { uid: 'fixture-account', role: 'patient' }, action: 'appointment_created', resource: { type: 'appointment', id: 'fixture-appointment' } }),
  firestore('staffProfiles/fixture-old-staff', { uid: 'fixture-old-staff', role: 'manager', disabled: false }),
  firestore('rateLimits/fixture-rate', { count: 1, expiresAt: at }),
  firestore('integrations/googleCalendar', { status: 'not_connected' }),
  firestore('integrationOAuthStates/fixture-state', { uid: 'fixture-old-staff', createdAt: at, expiresAt: at }),
  record('static', 'fixture-video', { title: 'Synthetic guide', topic: 'Synthetic topic', path: 'synthetic/not-a-real-video.mp4', kind: 'video' }),
];
module.exports = { fixtures };
