// Source inventory, not a promise that every known field is SQL-mapped.
// Exact leaf paths only: new nested fields/collections must be reviewed explicitly.
const times = ['createdAt', 'createdAt.seconds', 'createdAt.nanoseconds', 'updatedAt', 'updatedAt.seconds', 'updatedAt.nanoseconds'];
const profile = ['title', 'displayName', 'phone', 'email', 'dateOfBirth', 'gender', 'maritalStatus', 'bloodGroup', 'addressLine1', 'city', 'state', 'postalCode', 'emergencyContactName', 'emergencyContactPhone', 'allergies', 'currentMedications', 'healthNotes'];
const session = ['sessions[].weekday', 'sessions[].start', 'sessions[].end'];
const item = (source, path, disposition, fields) => ({ source, path, disposition, fields });
const manifest = {
  auth: item('auth', '{uid}', 'authoritative_auth', ['uid', 'displayName', 'emailVerified', 'disabled', 'customClaims.role', 'customClaims.doctorId', 'customClaims.forcePasswordChange']),
  public_config: item('firestore', 'clinic/publicConfig', 'deferred', ['name', 'phone', 'email', 'address', 'timezone', 'bookingWindowDays', 'leadMinutes', 'intervalMinutes', 'bufferBeforeMinutes', 'bufferAfterMinutes', 'autoConfirm', 'patientCancellationCutoffHours', 'visitTypes[].id', 'visitTypes[].label', 'visitTypes[].minutes', 'visitTypes[].mode', 'visitTypes[].feePaise', 'updatedBy', ...times]),
  branches: item('firestore', 'branches/{id}', 'catalog_candidate', ['name', 'code', 'timezone', 'active', 'address.line1', 'address.line2', 'address.city', 'address.state', 'address.postalCode', 'address.country', 'updatedBy', ...times]),
  departments: item('firestore', 'departments/{id}', 'catalog_candidate', ['branchId', 'name', 'code', 'description', 'active', 'publicBookingEnabled', 'sortOrder', 'updatedBy', ...times]),
  doctors: item('firestore', 'doctors/{id}', 'catalog_candidate', ['branchId', 'departmentIds[]', 'name', 'qualification', 'registrationNumber', 'bio', 'photoPath', 'active', 'bookingEnabled', 'weeklySchedule[].weekday', 'weeklySchedule[].startTime', 'weeklySchedule[].endTime', 'weeklySchedule[].slotMinutes', 'updatedBy', ...times]),
  patients: item('firestore', 'patients/{id}', 'deferred', [...profile, 'uid', 'uhid', 'linkedUids[]', 'recordSource', 'displayNameLower', 'phoneNormalized', 'createdBy', ...times]),
  patient_directory: item('firestore', 'patientDirectory/{id}', 'derived', ['uid', 'patientId', 'uhid', 'displayName', 'displayNameLower', 'email', 'emailLower', 'phone', 'phoneNormalized', 'linkedUids[]', ...times]),
  identity_locks: item('firestore', 'patientIdentityLocks/{id}', 'derived', ['patientId', ...times]),
  counters: item('firestore', 'counters/patientUhid', 'deferred', ['value', ...times]),
  schedules: item('firestore', 'doctorSchedules/{id}', 'deferred', ['doctorId', ...session, 'updatedBy', ...times]),
  exceptions: item('firestore', 'scheduleExceptions/{id}', 'deferred', ['doctorId', 'dateKey', 'type', 'note', 'reason', 'sessions[].start', 'sessions[].end', 'createdBy', 'updatedBy', ...times]),
  old_schedules: item('firestore', 'clinicSchedules/{id}', 'deferred', ['doctorId', ...session, ...times]),
  appointments: item('firestore', 'appointments/{id}', 'deferred', ['reference', 'branchId', 'departmentId', 'doctorId', 'visitType', 'visitMode', 'dateKey', 'startsAt', 'endsAt', 'status', 'source', 'patientId', 'patientSnapshot.name', 'patientSnapshot.phone', 'patientSnapshot.email', 'phoneKey', 'reason', 'slotIds[]', 'slotId', 'consent.version', 'consent.acceptedAt', 'createdBy.uid', 'createdBy.role', 'externalCalendar.provider', 'externalCalendar.syncStatus', 'videoConsultation.status', ...times]),
  appointment_events: item('firestore', 'appointments/{appointmentId}/events/{id}', 'deferred', ['from', 'to', 'byUid', 'byRole', 'at', 'reason', 'meta.source', ...times]),
  slots: item('firestore', 'appointmentSlots/{id}', 'derived', ['doctorId', 'dateKey', 'startsAt', 'endsAt', 'appointmentId', 'status', ...times]),
  booking_requests: item('firestore', 'bookingRequests/{id}', 'deferred', ['appointmentId', 'reference', 'status', ...times]),
  medical_history: item('firestore', 'patients/{patientId}/medicalHistory/{id}', 'deferred', ['doctorId', 'date', 'diagnosis', 'notes', ...times]),
  medical_documents: item('firestore', 'patients/{patientId}/medicalDocuments/{id}', 'deferred', ['doctorId', 'name', 'title', 'url', 'storagePath', 'visibleToPatient', 'contentType', 'size', ...times]),
  feedback: item('firestore', 'patientFeedback/{id}', 'deferred', ['appointmentId', 'patientId', 'rating', 'comment', 'status', 'reviewedAt', 'reviewedBy', 'publishedAt', ...times]),
  audit: item('firestore', 'auditLogs/{id}', 'deferred', ['at', 'actor.uid', 'actor.role', 'action', 'resource.type', 'resource.id', 'meta.source', 'meta.status', 'meta.rating', ...times]),
  retired_staff: item('firestore', 'staffProfiles/{id}', 'obsolete', ['uid', 'displayName', 'email', 'role', 'doctorId', 'disabled', 'forcePasswordChange', ...times]),
  rate_limits: item('firestore', 'rateLimits/{id}', 'security_state', ['count', 'windowStartedAt', 'expiresAt', ...times]),
  calendar_integration: item('firestore', 'integrations/googleCalendar', 'secret_excluded', ['status', 'calendarId', 'encryptedRefreshToken', 'connectedBy', ...times]),
  oauth_states: item('firestore', 'integrationOAuthStates/{id}', 'secret_excluded', ['uid', 'createdAt', 'expiresAt', 'usedAt']),
  public_assets: item('static', '{id}', 'static_assets', ['title', 'topic', 'path', 'kind']),
};
manifest.public_config.fields.push('slotMinutes', 'visitTypes[].active');
manifest.medical_history.fields.push('details');
manifest.medical_documents.fields.push('category', 'details');
manifest.patients.fields.push('createdBy.uid', 'createdBy.role', 'updatedBy');
manifest.audit.fields.push('meta.sessionCount', 'meta.doctorId', 'meta.dateKey', 'meta.type', 'meta.indexed', 'meta.fields[]', 'meta.active', 'meta.branchId', 'meta.publicBookingEnabled', 'meta.bookingEnabled', 'meta.count', 'meta.feedbackId', 'meta.visitMode', 'meta.fromDateKey', 'meta.toDateKey', 'meta.action', 'meta.affectedAppointments');
manifest.appointments.fields.push('videoConsultation', 'externalCalendar.calendarId', 'externalCalendar.eventId', 'externalCalendar.lastSyncError', 'videoConsultation.joinUrl', 'videoConsultation.preparedBy', 'videoConsultation.clearedBy', 'cancellation.byUid', 'cancellation.byRole', 'cancellation.reason');
manifest.appointment_events.fields.push('meta.action', 'meta.dateKey', 'meta.fromDateKey', 'meta.toDateKey', 'meta.toTime');
// Exported Firestore instants may be exact seconds/nanoseconds objects, not ISO strings.
for (const [category, fields] of Object.entries({ appointments: ['startsAt', 'endsAt', 'consent.acceptedAt', 'externalCalendar.lastSyncedAt', 'videoConsultation.preparedAt', 'videoConsultation.clearedAt', 'cancellation.at'], appointment_events: ['at'], slots: ['startsAt', 'endsAt'], feedback: ['reviewedAt', 'publishedAt'], audit: ['at'] })) {
  manifest[category].fields.push(...fields.filter(field => !manifest[category].fields.includes(field)));
  manifest[category].fields.push(...fields.flatMap(field => [`${field}.seconds`, `${field}.nanoseconds`]));
}
module.exports = { manifest };
