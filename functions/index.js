const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const crypto = require('crypto');
const { istDateKey, istInstant, toIstParts } = require('./lib/ist');
const { istUnitId, unitSlotsForRange } = require('./lib/engine/units');
const { computeDaySlots } = require('./lib/engine/availability');
const { placeAppointmentInTransaction, releaseUnitsInTransaction, unitsHeldBy } = require('./src/scheduler/placement');
const { createAvailabilityCallables } = require('./src/scheduler/availabilityCallables');
const { createHoldHandlers, isHoldId } = require('./src/scheduler/holds');
const { schedulerError } = require('./src/scheduler/errors');
const { enqueueForAppointment } = require('./src/scheduler/notify');
const { buildAuthorizationUrl, createEvent, deleteEvent, decrypt, encrypt, exchangeAuthorizationCode, freeBusy, refreshAccessToken, updateEventTime } = require('./lib/googleCalendar');
const { ROLE, canTransition } = require('./lib/stateMachine');
const { isDoctorId, isEmail, isStaffRole, isStrongTemporaryPassword, normalizeEmail, staffClaims } = require('./lib/staffAccess');
const { canPatientCancel, isActiveAppointment } = require('./lib/appointmentPolicy');
const { formatUhid, isUhid, normalizePatientName, normalizePhone } = require('./lib/patientRegistry');
const { toE164 } = require('./lib/phone');
const { hashToken, newManageToken, tokensEqual } = require('./lib/tokens');
const { newReference } = require('./lib/engine/reference');
const { CONSENT_VERSION, validateBookingInput } = require('./lib/engine/bookingInput');
const { canAttempt, nextRetryAt, notificationState, providerConfig } = require('./lib/notifications');
admin.initializeApp();
Object.assign(exports, require('./src/scheduler'));
setGlobalOptions({ region: 'asia-south1', maxInstances: 10 });

const db = admin.firestore();
const GOOGLE_CALENDAR_CLIENT_ID = defineSecret('GOOGLE_CALENDAR_CLIENT_ID');
const GOOGLE_CALENDAR_CLIENT_SECRET = defineSecret('GOOGLE_CALENDAR_CLIENT_SECRET');
const GOOGLE_CALENDAR_TOKEN_KEY = defineSecret('GOOGLE_CALENDAR_TOKEN_KEY');
const EMAIL_WEBHOOK_URL = defineSecret('EMAIL_WEBHOOK_URL');
const WHATSAPP_WEBHOOK_URL = defineSecret('WHATSAPP_WEBHOOK_URL');
const callableOptions = { region: 'asia-south1', enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' };

const notificationPayload = ({ notification, appointment }) => ({
  type: notification.type,
  channel: notification.channel,
  to: notification.to,
  reference: appointment.reference || '',
  dateKey: appointment.dateKey || '',
  time: appointment.startsAt?.toDate ? appointment.startsAt.toDate().toISOString() : '',
});

const sendNotification = async ({ notification, appointment }) => {
  const urls = { email: EMAIL_WEBHOOK_URL.value(), whatsapp: WHATSAPP_WEBHOOK_URL.value() };
  const url = urls[notification.channel];
  if (!url) throw new Error(`No ${notification.channel} notification provider is configured.`);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(notificationPayload({ notification, appointment })),
  });
  if (!response.ok) throw new Error(`Notification provider returned HTTP ${response.status}.`);
};

const deliverNotificationRef = async (ref) => {
  const initialSnapshot = await ref.get();
  if (!initialSnapshot.exists) return;
  const initial = initialSnapshot.data() || {};
  if (!canAttempt(initial)) return;
  const claimed = await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    const data = current.data() || {};
    if (!canAttempt(data)) return null;
    const state = notificationState(data);
    transaction.update(ref, { status: 'processing', attempts: state.attempts + 1, processingAt: FieldValue.serverTimestamp() });
    return { ...data, attempts: state.attempts + 1 };
  });
  if (!claimed) return;
  try {
    const appointmentSnapshot = await db.collection('appointments').doc(claimed.appointmentId).get();
    if (!appointmentSnapshot.exists) throw new Error('The appointment for this notification no longer exists.');
    await sendNotification({ notification: claimed, appointment: appointmentSnapshot.data() });
    await ref.update({ status: 'sent', sentAt: FieldValue.serverTimestamp(), lastError: FieldValue.delete() });
  } catch (error) {
    const state = notificationState(claimed);
    const exhausted = state.attempts >= state.maxAttempts;
    await ref.update({
      status: exhausted ? 'dead_letter' : 'queued',
      sendAfter: exhausted ? FieldValue.delete() : Timestamp.fromDate(nextRetryAt(state.attempts)),
      lastError: String(error.message || 'Notification provider failed').slice(0, 240),
      failedAt: FieldValue.serverTimestamp(),
    });
  }
};

exports.processNotification = onDocumentCreated({
  document: 'notifications/{notificationId}',
  region: 'asia-south1',
  secrets: [EMAIL_WEBHOOK_URL, WHATSAPP_WEBHOOK_URL],
  retry: false,
}, async (event) => {
  if (event.data) await deliverNotificationRef(event.data.ref);
});

exports.processNotificationQueue = onSchedule({ schedule: 'every 5 minutes', timeZone: 'Asia/Kolkata', region: 'asia-south1', secrets: [EMAIL_WEBHOOK_URL, WHATSAPP_WEBHOOK_URL] }, async () => {
  const snapshot = await db.collection('notifications')
    .where('status', '==', 'queued')
    .where('sendAfter', '<=', Timestamp.now())
    .orderBy('sendAfter')
    .limit(50)
    .get();
  await Promise.all(snapshot.docs.map((notification) => deliverNotificationRef(notification.ref)));
});

exports.sendReminders = onSchedule({ schedule: 'every 15 minutes', timeZone: 'Asia/Kolkata', region: 'asia-south1', secrets: [EMAIL_WEBHOOK_URL, WHATSAPP_WEBHOOK_URL] }, async () => {
  const now = new Date();
  const horizon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const snapshot = await db.collection('appointments')
    .where('status', 'in', ['scheduled', 'confirmed'])
    .where('startsAt', '>=', Timestamp.fromDate(now))
    .where('startsAt', '<=', Timestamp.fromDate(horizon))
    .limit(100)
    .get();
  const writes = [];
  snapshot.docs.forEach((appointment) => {
    const data = appointment.data();
    if (!data.patientSnapshot?.email) return;
    const id = `${appointment.id}_reminder_24h`;
    writes.push(db.collection('notifications').doc(id).create({
      type: 'appointment_reminder_24h',
      channel: 'email',
      to: data.patientSnapshot.email,
      appointmentId: appointment.id,
      status: 'queued',
      attempts: 0,
      sendAfter: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }).catch((error) => {
      if (error.code !== 6) throw error;
    }));
  });
  await Promise.all(writes);
});
const assertPasswordChanged = (request) => {
  if (request.auth?.token?.forcePasswordChange === true) throw new HttpsError('permission-denied', 'Change your temporary password first.');
};
const requireAdmin = (request) => {
  assertPasswordChanged(request);
  if (!request.auth || request.auth.token.role !== 'admin') throw new HttpsError('permission-denied', 'Administrator access is required.');
};

const requireRegistrationStaff = (request) => {
  assertPasswordChanged(request);
  const role = request.auth?.token?.role;
  if (!request.auth || !['admin', 'manager'].includes(role)) throw new HttpsError('permission-denied', 'Manager or administrator access is required.');
  return role;
};

const auditStaffAccess = async ({ actorUid, actorRole = 'admin', action, targetUid, resourceType = 'staff_account', meta = {} }) => db.collection('auditLogs').add({
  at: FieldValue.serverTimestamp(),
  actor: { uid: actorUid, role: actorRole },
  action,
  resource: { type: resourceType, id: targetUid },
  meta,
});

const activeAdminCount = async () => {
  let pageToken;
  let count = 0;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    count += page.users.filter((user) => !user.disabled && user.customClaims?.role === 'admin').length;
    pageToken = page.pageToken;
  } while (pageToken);
  return count;
};

const preventSelfOrLastAdminLockout = async ({ actorUid, target, nextRole, nextDisabled }) => {
  const changingAdminAuthority = target.customClaims?.role === 'admin'
    && (nextRole !== 'admin' || nextDisabled === true);
  if (target.uid === actorUid && changingAdminAuthority) throw new HttpsError('failed-precondition', 'Use a different active administrator to change your own administrator access.');
  if (changingAdminAuthority && await activeAdminCount() <= 1) throw new HttpsError('failed-precondition', 'At least one active administrator must remain assigned.');
};

const isClinicTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
const timeToMinutes = (value) => {
  const [hour, minute] = String(value).split(':').map(Number);
  return hour * 60 + minute;
};
const scheduleAuthority = (request, doctorId) => {
  assertPasswordChanged(request);
  const role = request.auth?.token?.role;
  if (!request.auth || !['admin', 'doctor'].includes(role)) throw new HttpsError('permission-denied', 'Administrator or doctor access is required.');
  if (role === 'doctor' && request.auth.token.doctorId !== doctorId) throw new HttpsError('permission-denied', 'You can only manage your own schedule.');
  return role;
};
const normaliseScheduleSessions = (value) => {
  if (!Array.isArray(value) || value.length > 14) throw new HttpsError('invalid-argument', 'Provide at most fourteen weekly clinic hours.');
  const sessions = value.map((session) => ({ weekday: Number(session?.weekday), start: String(session?.start || ''), end: String(session?.end || '') }));
  if (sessions.some((session) => !Number.isInteger(session.weekday) || session.weekday < 0 || session.weekday > 6 || !isClinicTime(session.start) || !isClinicTime(session.end) || timeToMinutes(session.start) >= timeToMinutes(session.end))) throw new HttpsError('invalid-argument', 'Each weekly session needs a valid weekday and start/end time.');
  sessions.sort((left, right) => left.weekday - right.weekday || timeToMinutes(left.start) - timeToMinutes(right.start));
  if (sessions.some((session, index) => index > 0 && session.weekday === sessions[index - 1].weekday && timeToMinutes(session.start) < timeToMinutes(sessions[index - 1].end))) throw new HttpsError('invalid-argument', 'Weekly clinic sessions cannot overlap.');
  return sessions;
};
const normaliseExceptionSessions = (value) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) throw new HttpsError('invalid-argument', 'Provide between one and four special-hours sessions.');
  const sessions = value.map((session) => ({ start: String(session?.start || ''), end: String(session?.end || '') }));
  if (sessions.some((session) => !isClinicTime(session.start) || !isClinicTime(session.end) || timeToMinutes(session.start) >= timeToMinutes(session.end))) throw new HttpsError('invalid-argument', 'Each special-hours session needs a valid start and end time.');
  sessions.sort((left, right) => timeToMinutes(left.start) - timeToMinutes(right.start));
  if (sessions.some((session, index) => index > 0 && timeToMinutes(session.start) < timeToMinutes(sessions[index - 1].end))) throw new HttpsError('invalid-argument', 'Special clinic sessions cannot overlap.');
  return sessions;
};

// Scheduling writes are server-owned so browser-supplied audit fields and
// closed-day safeguards cannot be bypassed. A closure always goes through
// closeDay, which previews and resolves affected appointments first.
exports.saveDoctorSchedule = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const doctorId = trimmed(request.data?.doctorId, 120);
  if (!isDoctorId(doctorId)) throw new HttpsError('invalid-argument', 'Choose a valid doctor.');
  const role = scheduleAuthority(request, doctorId);
  const sessions = normaliseScheduleSessions(request.data?.sessions);
  await db.collection('doctorSchedules').doc(doctorId).set({ doctorId, sessions, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true });
  await db.collection('auditLogs').add({ at: FieldValue.serverTimestamp(), actor: { uid: request.auth.uid, role }, action: 'doctor_schedule_saved', resource: { type: 'doctor_schedule', id: doctorId }, meta: { sessionCount: sessions.length } });
  return { message: 'Regular clinic hours saved.' };
});

exports.saveScheduleException = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const doctorId = trimmed(request.data?.doctorId, 120);
  const dateKey = trimmed(request.data?.dateKey, 10);
  const type = request.data?.type;
  if (!isDoctorId(doctorId) || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !['extra', 'replace'].includes(type)) throw new HttpsError('invalid-argument', 'Choose valid special clinic hours.');
  const role = scheduleAuthority(request, doctorId);
  const sessions = normaliseExceptionSessions(request.data?.sessions);
  const ref = db.collection('scheduleExceptions').doc(`${doctorId}_${dateKey}`);
  await ref.set({ doctorId, dateKey, type, sessions, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid, createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  await db.collection('auditLogs').add({ at: FieldValue.serverTimestamp(), actor: { uid: request.auth.uid, role }, action: 'schedule_exception_saved', resource: { type: 'schedule_exception', id: ref.id }, meta: { doctorId, dateKey, type, sessionCount: sessions.length } });
  return { message: 'Special clinic hours saved.' };
});

exports.deleteScheduleException = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const doctorId = trimmed(request.data?.doctorId, 120);
  const dateKey = trimmed(request.data?.dateKey, 10);
  if (!isDoctorId(doctorId) || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new HttpsError('invalid-argument', 'Choose a valid exception date.');
  const role = scheduleAuthority(request, doctorId);
  const ref = db.collection('scheduleExceptions').doc(`${doctorId}_${dateKey}`);
  const snapshot = await ref.get();
  if (!snapshot.exists) return { deleted: false };
  await ref.delete();
  await db.collection('auditLogs').add({ at: FieldValue.serverTimestamp(), actor: { uid: request.auth.uid, role }, action: 'schedule_exception_deleted', resource: { type: 'schedule_exception', id: ref.id }, meta: { doctorId, dateKey } });
  return { deleted: true };
});

// Patient identifiers are indexed on the trusted server. The browser never gets
// permission to enumerate the patients collection, which prevents an accidental
// directory exposure as the clinic grows.
const PATIENT_PROFILE_FIELDS = Object.freeze([
  'title', 'displayName', 'phone', 'dateOfBirth', 'gender', 'maritalStatus',
  'bloodGroup', 'addressLine1', 'city', 'state', 'postalCode',
  'emergencyContactName', 'emergencyContactPhone', 'allergies',
  'currentMedications', 'healthNotes',
]);
const patientProfile = (input = {}) => {
  const result = {};
  PATIENT_PROFILE_FIELDS.forEach((field) => { result[field] = trimmed(input[field], field === 'healthNotes' || field === 'allergies' || field === 'currentMedications' ? 2000 : 160); });
  if (!result.displayName) throw new HttpsError('invalid-argument', 'A patient full name is required.');
  if (result.dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(result.dateOfBirth)) throw new HttpsError('invalid-argument', 'Use a valid date of birth.');
  return result;
};
const patientDirectoryRecord = ({ patientId, uid, email, profile, uhid = '', linkedUids = [] }) => ({
  // uid is retained while authenticated patient records use their Auth UID as
  // the document ID. patientId is the registry-facing identifier and supports
  // staff-created records that are not linked to an account yet.
  uid: uid || linkedUids[0] || patientId,
  patientId: patientId || uid,
  uhid,
  displayName: profile.displayName,
  displayNameLower: normalizePatientName(profile.displayName),
  email: normalizeEmail(email),
  emailLower: normalizeEmail(email),
  phone: profile.phone || '',
  phoneNormalized: normalizePhone(profile.phone),
  linkedUids: Array.isArray(linkedUids) ? [...new Set(linkedUids)].slice(0, 10) : [],
  updatedAt: FieldValue.serverTimestamp(),
});
const auditPatientAccess = ({ actorUid, actorRole = 'admin', action, targetUid, meta = {} }) => db.collection('auditLogs').add({
  at: FieldValue.serverTimestamp(), actor: { uid: actorUid, role: actorRole }, action,
  resource: { type: 'patient', id: targetUid }, meta,
});

const allocateUhid = async (transaction) => {
  const counterRef = db.collection('counters').doc('patientUhid');
  const counter = await transaction.get(counterRef);
  const current = Number(counter.get('value')) || 0;
  if (!Number.isInteger(current) || current < 0) throw new HttpsError('failed-precondition', 'The patient ID registry requires administrator review.');
  const next = current + 1;
  transaction.set(counterRef, { value: next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return formatUhid(next);
};

const patientIdentityLockId = ({ displayName, phone }) => crypto.createHash('sha256')
  .update(`${normalizePatientName(displayName)}\u0000${normalizePhone(phone)}`)
  .digest('hex');

exports.syncPatientDirectory = onCall({ ...callableOptions, timeoutSeconds: 120, memory: '256MiB' }, async (request) => {
  requireAdmin(request);
  const snapshot = await db.collection('patients').get();
  let batch = db.batch(); let writes = 0; let indexed = 0;
  for (const patient of snapshot.docs) {
    const data = patient.data();
    const email = normalizeEmail(data.email);
    const displayName = trimmed(data.displayName, 160);
    if (!displayName) continue;
    const linkedUids = Array.isArray(data.linkedUids) ? data.linkedUids : (data.recordSource === 'staff' ? [] : [patient.id]);
    batch.set(db.collection('patientDirectory').doc(patient.id), patientDirectoryRecord({ patientId: patient.id, uid: linkedUids[0] || patient.id, email, profile: { ...data, displayName }, uhid: data.uhid || '', linkedUids }), { merge: true });
    writes += 1; indexed += 1;
    if (writes === 400) { await batch.commit(); batch = db.batch(); writes = 0; }
  }
  if (writes) await batch.commit();
  await auditPatientAccess({ actorUid: request.auth.uid, action: 'patient_directory_synchronised', targetUid: request.auth.uid, meta: { indexed } });
  return { indexed };
});

exports.searchPatients = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const actorRole = requireRegistrationStaff(request);
  const rawTerm = trimmed(request.data?.term, 120);
  const term = rawTerm.toLowerCase();
  const phone = normalizePhone(rawTerm);
  if (term.length < 2) throw new HttpsError('invalid-argument', 'Enter at least two characters to search patients.');
  let snapshot;
  if (isUhid(rawTerm)) snapshot = await db.collection('patientDirectory').where('uhid', '==', rawTerm.toUpperCase()).limit(1).get();
  else if (term.includes('@')) snapshot = await db.collection('patientDirectory').where('emailLower', '==', term).limit(20).get();
  else if (phone) snapshot = await db.collection('patientDirectory').where('phoneNormalized', '==', phone).limit(20).get();
  else snapshot = await db.collection('patientDirectory').orderBy('displayNameLower').startAt(term).endAt(`${term}\uf8ff`).limit(20).get();
  const patients = snapshot.docs.map((item) => ({
    uid: item.get('uid') || item.id,
    patientId: item.get('patientId') || item.id,
    uhid: item.get('uhid') || '',
    displayName: item.get('displayName'),
    email: item.get('email'),
    phone: item.get('phone') || '',
  }));
  await db.collection('auditLogs').add({ at: FieldValue.serverTimestamp(), actor: { uid: request.auth.uid, role: actorRole }, action: 'patient_searched', resource: { type: 'patient_search', id: 'directory' } });
  return { patients };
});

exports.getAdminPatientProfile = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  requireAdmin(request);
  const uid = trimmed(request.data?.uid, 128);
  if (!uid) throw new HttpsError('invalid-argument', 'Select a patient first.');
  const snapshot = await db.collection('patients').doc(uid).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Patient record not found.');
  const data = snapshot.data();
  const appointments = await db.collection('appointments')
    .where('patientId', '==', uid)
    .orderBy('startsAt', 'desc')
    .limit(25)
    .get();
  await db.collection('auditLogs').add({ at: FieldValue.serverTimestamp(), actor: { uid: request.auth.uid, role: 'admin' }, action: 'patient_profile_viewed', resource: { type: 'patient', id: uid } });
  return {
    uid,
    patientId: uid,
    uhid: data.uhid || '',
    linkedUids: Array.isArray(data.linkedUids) ? data.linkedUids : [uid],
    profile: Object.fromEntries([...PATIENT_PROFILE_FIELDS, 'email', 'createdAt', 'updatedAt'].map((field) => [field, data[field] || ''])),
    appointments: appointments.docs.map((item) => ({
      id: item.id,
      reference: item.get('reference') || '',
      dateKey: item.get('dateKey') || '',
      startsAt: item.get('startsAt')?.toDate?.()?.toISOString() || null,
      status: item.get('status') || 'scheduled',
      visitType: item.get('visitTypeLabel') || item.get('visitType') || 'Consultation',
    })),
  };
});

exports.updateAdminPatientProfile = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  requireAdmin(request);
  const uid = trimmed(request.data?.uid, 128);
  if (!uid) throw new HttpsError('invalid-argument', 'Select a patient first.');
  const patientRef = db.collection('patients').doc(uid);
  const profile = patientProfile(request.data?.profile);
  let existing; let uhid;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(patientRef);
    if (!snapshot.exists) throw new HttpsError('not-found', 'Patient record not found.');
    existing = snapshot.data();
    const email = normalizeEmail(existing.email);
    uhid = existing.uhid || await allocateUhid(transaction);
    const linkedUids = Array.isArray(existing.linkedUids) ? existing.linkedUids : [uid];
    transaction.set(patientRef, {
      ...profile, email, uhid, linkedUids, displayNameLower: normalizePatientName(profile.displayName), phoneNormalized: normalizePhone(profile.phone),
      updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid,
    }, { merge: true });
    transaction.set(db.collection('patientDirectory').doc(uid), patientDirectoryRecord({ patientId: uid, uid, email, profile, uhid, linkedUids }), { merge: true });
  });
  await admin.auth().updateUser(uid, { displayName: `${profile.title ? `${profile.title} ` : ''}${profile.displayName}`.trim() }).catch(() => null);
  await auditPatientAccess({ actorUid: request.auth.uid, action: 'patient_profile_updated', targetUid: uid, meta: { fields: PATIENT_PROFILE_FIELDS.filter((field) => profile[field] !== (existing[field] || '')) } });
  return { message: 'Patient profile updated.', uhid };
});

// Patient-side profile writes also use the trusted boundary. This keeps the
// private directory current while preserving a patient’s right to manage only
// their own information.
exports.registerPatientProfile = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  if (!request.auth || isStaffRole(request.auth.token.role)) throw new HttpsError('permission-denied', 'Patient sign-in is required.');
  const user = await admin.auth().getUser(request.auth.uid);
  const displayName = trimmed(request.data?.displayName, 160);
  if (!displayName || !isEmail(user.email) || user.emailVerified !== true) throw new HttpsError('failed-precondition', 'Verify the email address on this account before creating a patient profile.');
  const linked = await db.collection('patientDirectory').where('linkedUids', 'array-contains', request.auth.uid).limit(1).get();
  const patientId = linked.docs[0]?.get('patientId') || user.uid;
  const patientRef = db.collection('patients').doc(patientId);
  let uhid;
  await db.runTransaction(async (transaction) => {
    const prior = await transaction.get(patientRef);
    const priorData = prior.exists ? prior.data() : {};
    const profile = { ...patientProfile({ displayName, ...priorData }), displayName };
    uhid = priorData.uhid || await allocateUhid(transaction);
    const linkedUids = [...new Set([...(Array.isArray(priorData.linkedUids) ? priorData.linkedUids : []), user.uid])];
    transaction.set(patientRef, {
      ...profile, email: normalizeEmail(user.email), uhid, linkedUids,
      displayNameLower: normalizePatientName(profile.displayName), phoneNormalized: normalizePhone(profile.phone),
      createdAt: prior.exists ? priorData.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(db.collection('patientDirectory').doc(patientId), patientDirectoryRecord({ patientId, uid: user.uid, email: user.email, profile, uhid, linkedUids }), { merge: true });
  });
  return { message: 'Patient profile created.', uhid };
});

exports.updateOwnPatientProfile = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  if (!request.auth || isStaffRole(request.auth.token.role)) throw new HttpsError('permission-denied', 'Patient sign-in is required.');
  const user = await admin.auth().getUser(request.auth.uid);
  if (user.emailVerified !== true) throw new HttpsError('failed-precondition', 'Verify the email address on this account before updating a patient profile.');
  const patientRef = db.collection('patients').doc(user.uid);
  const profile = patientProfile(request.data?.profile);
  let uhid;
  await db.runTransaction(async (transaction) => {
    const prior = await transaction.get(patientRef);
    const priorData = prior.exists ? prior.data() : {};
    uhid = priorData.uhid || await allocateUhid(transaction);
    const linkedUids = [...new Set([...(Array.isArray(priorData.linkedUids) ? priorData.linkedUids : []), user.uid])];
    transaction.set(patientRef, {
      ...profile, email: normalizeEmail(user.email), uhid, linkedUids,
      displayNameLower: normalizePatientName(profile.displayName), phoneNormalized: normalizePhone(profile.phone),
      createdAt: prior.exists ? priorData.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(db.collection('patientDirectory').doc(user.uid), patientDirectoryRecord({ patientId: user.uid, uid: user.uid, email: user.email, profile, uhid, linkedUids }), { merge: true });
  });
  await admin.auth().updateUser(user.uid, { displayName: `${profile.title ? `${profile.title} ` : ''}${profile.displayName}`.trim() });
  return { message: 'Your profile has been saved.', uhid };
});

exports.getOwnPatientProfile = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  if (!request.auth || isStaffRole(request.auth.token.role)) throw new HttpsError('permission-denied', 'Patient sign-in is required.');
  const user = await admin.auth().getUser(request.auth.uid);
  if (user.emailVerified !== true) throw new HttpsError('failed-precondition', 'Verify your email address before opening the patient portal.');
  const linked = await db.collection('patientDirectory').where('linkedUids', 'array-contains', request.auth.uid).limit(5).get();
  const patientId = linked.docs[0]?.get('patientId') || request.auth.uid;
  const snapshot = await db.collection('patients').doc(patientId).get();
  if (!snapshot.exists) return { patientId, profile: {}, linked: false };
  const data = snapshot.data();
  return { patientId, linked: patientId !== request.auth.uid, profile: Object.fromEntries([...PATIENT_PROFILE_FIELDS, 'email', 'uhid', 'createdAt', 'updatedAt', 'linkedUids'].map((field) => [field, data[field] || ''])) };
});

exports.getDoctorPatientSummary = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  if (!request.auth || request.auth.token.role !== 'doctor' || request.auth.token.get('forcePasswordChange', false) === true || !request.auth.token.doctorId) {
    throw new HttpsError('permission-denied', 'Doctor access is required.');
  }
  const appointmentId = trimmed(request.data?.appointmentId, 200);
  if (!appointmentId) throw new HttpsError('invalid-argument', 'Choose an appointment.');
  const appointmentSnapshot = await db.collection('appointments').doc(appointmentId).get();
  if (!appointmentSnapshot.exists || appointmentSnapshot.get('doctorId') !== request.auth.token.doctorId) {
    throw new HttpsError('permission-denied', 'This appointment is outside your clinical workspace.');
  }
  const patientId = trimmed(appointmentSnapshot.get('patientId'), 200);
  if (!patientId) throw new HttpsError('failed-precondition', 'This appointment has no linked patient record.');
  const [patientSnapshot, appointmentHistory] = await Promise.all([
    db.collection('patients').doc(patientId).get(),
    db.collection('appointments').where('patientId', '==', patientId).limit(50).get(),
  ]);
  const patient = patientSnapshot.exists ? patientSnapshot.data() : {};
  const history = appointmentHistory.docs
    .map((item) => ({ id: item.id, ...item.data() }))
    .sort((left, right) => (asDate(right.startsAt)?.getTime() || 0) - (asDate(left.startsAt)?.getTime() || 0))
    .map((item) => ({
      id: item.id,
      dateKey: item.dateKey || null,
      startsAt: asDate(item.startsAt)?.toISOString() || null,
      status: item.status || 'scheduled',
      visitKind: item.patientSnapshot?.visitKind || null,
      reason: item.reason || null,
      doctorId: item.doctorId || null,
    }));
  return {
    patientId,
    profile: Object.fromEntries(['displayName', 'title', 'phone', 'email', 'dateOfBirth', 'gender', 'bloodGroup', 'uhid'].map((field) => [field, patient[field] || ''])),
    history,
  };
});

exports.requestPatientLink = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  if (!request.auth || isStaffRole(request.auth.token.role)) throw new HttpsError('permission-denied', 'Patient sign-in is required.');
  const user = await admin.auth().getUser(request.auth.uid);
  if (user.emailVerified !== true) throw new HttpsError('failed-precondition', 'Verify your email address before requesting a clinic record link.');
  const uhid = trimmed(request.data?.uhid, 40).toUpperCase();
  const phone = normalizePhone(request.data?.phone);
  if (!isUhid(uhid) || !phone) throw new HttpsError('invalid-argument', 'Enter your clinic ID and the phone number registered with the clinic.');
  const matches = await db.collection('patientDirectory').where('uhid', '==', uhid).limit(1).get();
  const record = matches.docs[0];
  if (!record || record.get('phoneNormalized') !== phone) throw new HttpsError('not-found', 'We could not verify those details. Contact the clinic if you need help.');
  const linkedUids = Array.isArray(record.get('linkedUids')) ? record.get('linkedUids') : [];
  if (linkedUids.includes(request.auth.uid)) return { status: 'linked' };
  if (linkedUids.length) throw new HttpsError('failed-precondition', 'This clinic record is already linked. Contact the clinic to update access.');
  const requestRef = db.collection('patientLinkRequests').doc(`${record.get('patientId')}_${request.auth.uid}`);
  await requestRef.set({ patientId: record.get('patientId'), uhid, requesterUid: request.auth.uid, requesterEmail: normalizeEmail(user.email), status: 'pending', expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { status: 'pending' };
});

exports.listPatientLinkRequests = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  requireAdmin(request);
  const snapshot = await db.collection('patientLinkRequests').where('status', '==', 'pending').orderBy('createdAt', 'desc').limit(50).get();
  return { requests: snapshot.docs.map((item) => ({ id: item.id, ...item.data() })) };
});

exports.approvePatientLinkRequest = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  requireAdmin(request);
  const requestId = trimmed(request.data?.requestId, 200);
  if (!requestId) throw new HttpsError('invalid-argument', 'Choose a link request.');
  const linkRef = db.collection('patientLinkRequests').doc(requestId);
  await db.runTransaction(async (transaction) => {
    const link = await transaction.get(linkRef);
    if (!link.exists || link.get('status') !== 'pending') throw new HttpsError('failed-precondition', 'This link request is no longer pending.');
    const patientRef = db.collection('patients').doc(link.get('patientId'));
    const directoryRef = db.collection('patientDirectory').doc(link.get('patientId'));
    const patient = await transaction.get(patientRef);
    const directory = await transaction.get(directoryRef);
    if (!patient.exists || !directory.exists) throw new HttpsError('not-found', 'The clinic record could not be found.');
    const linkedUids = Array.isArray(patient.get('linkedUids')) ? patient.get('linkedUids') : [];
    if (linkedUids.length) throw new HttpsError('failed-precondition', 'This clinic record is already linked.');
    transaction.update(patientRef, { linkedUids: [link.get('requesterUid')], updatedAt: FieldValue.serverTimestamp(), linkedBy: request.auth.uid });
    transaction.update(directoryRef, { linkedUids: [link.get('requesterUid')], uid: link.get('requesterUid'), updatedAt: FieldValue.serverTimestamp() });
    transaction.update(linkRef, { status: 'approved', approvedBy: request.auth.uid, approvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  });
  await auditPatientAccess({ actorUid: request.auth.uid, action: 'patient_link_approved', targetUid: requestId, meta: {} });
  return { status: 'approved' };
});

// Staff registration deliberately creates a clinical record only. Linking it to
// a future patient login is a separate, verified workflow so a manager can
// never take over an existing Firebase account by entering an email address.
exports.registerPatient = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const actorRole = requireRegistrationStaff(request);
  const profile = patientProfile(request.data?.profile);
  const phoneNormalized = normalizePhone(profile.phone);
  if (!phoneNormalized) throw new HttpsError('invalid-argument', 'Enter a valid patient phone number before registering the record.');
  const patientRef = db.collection('patients').doc();
  const lockRef = db.collection('patientIdentityLocks').doc(patientIdentityLockId(profile));
  let uhid;
  try {
    await db.runTransaction(async (transaction) => {
      const [lock, samePhone] = await Promise.all([
        transaction.get(lockRef),
        transaction.get(db.collection('patients').where('phoneNormalized', '==', phoneNormalized).limit(20)),
      ]);
      const duplicate = samePhone.docs.some((item) => normalizePatientName(item.get('displayName')) === normalizePatientName(profile.displayName));
      if (lock.exists || duplicate) throw new HttpsError('already-exists', 'A matching patient record already exists. Search the registry before registering another.');
      uhid = await allocateUhid(transaction);
      const now = FieldValue.serverTimestamp();
      transaction.set(patientRef, {
        ...profile, uhid, linkedUids: [], recordSource: 'staff',
        displayNameLower: normalizePatientName(profile.displayName), phoneNormalized,
        createdBy: { uid: request.auth.uid, role: actorRole }, createdAt: now, updatedAt: now,
      });
      transaction.set(db.collection('patientDirectory').doc(patientRef.id), patientDirectoryRecord({ patientId: patientRef.id, email: '', profile, uhid, linkedUids: [] }));
      transaction.set(lockRef, { patientId: patientRef.id, createdAt: now });
      transaction.set(db.collection('auditLogs').doc(), {
        at: now, actor: { uid: request.auth.uid, role: actorRole }, action: 'patient_registered',
        resource: { type: 'patient', id: patientRef.id }, meta: { source: 'staff_registration' },
      });
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('internal', 'The patient record could not be registered. Please try again.');
  }
  return { patientId: patientRef.id, uhid, message: 'Patient record registered.' };
});

// Privileged staff lifecycle operations. This endpoint is deliberately callable only by
// Firebase users carrying the trusted admin custom claim; the browser never sets roles.
exports.completeOwnPasswordChange = onCall({ ...callableOptions }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to change your password.');
  const actorRole = request.auth.token.role;
  if (!isStaffRole(actorRole)) throw new HttpsError('permission-denied', 'Staff access is required.');
  const user = await admin.auth().getUser(request.auth.uid);
  if (user.customClaims?.forcePasswordChange !== true) throw new HttpsError('failed-precondition', 'A mandatory password change is not pending for this account.');
  await admin.auth().setCustomUserClaims(user.uid, { ...user.customClaims, forcePasswordChange: false });
  await db.collection('staffProfiles').doc(user.uid).set({ requiresPasswordChange: false, updatedAt: FieldValue.serverTimestamp(), updatedBy: user.uid }, { merge: true });
  await auditStaffAccess({ actorUid: user.uid, actorRole, action: 'staff_password_changed', targetUid: user.uid, resourceType: 'staff' });
  return { ok: true };
});

exports.manageStaffAccount = onCall({ ...callableOptions }, async (request) => {
  const { action, email, password, displayName = '', role, doctorId, disabled } = request.data || {};

  requireAdmin(request);
  const normalizedEmail = normalizeEmail(email);
  if (!isEmail(normalizedEmail)) throw new HttpsError('invalid-argument', 'Enter a valid staff email address.');
  if (action === 'provision') {
    if (!isStaffRole(role) || !isStrongTemporaryPassword(password) || !String(displayName).trim()) throw new HttpsError('invalid-argument', 'Enter a name, valid role, and a temporary password with at least 8 characters, uppercase and lowercase letters, a number, and ! @ # or $.');
    if (role === 'doctor' && !isDoctorId(doctorId)) throw new HttpsError('invalid-argument', 'Enter a stable doctor ID using letters, numbers, hyphens, or underscores.');
    let user;
    try {
      user = await admin.auth().getUserByEmail(normalizedEmail);
      const existingProfile = await db.collection('staffProfiles').doc(user.uid).get();
      if (!existingProfile.exists && !isStaffRole(user.customClaims?.role)) throw new HttpsError('already-exists', 'This email already belongs to an account. Do not convert an existing account into staff access from this screen.');
      if (user.uid === request.auth.uid) throw new HttpsError('failed-precondition', 'You cannot re-provision your own account.');
      await preventSelfOrLastAdminLockout({ actorUid: request.auth.uid, target: user, nextRole: role, nextDisabled: false });
      await admin.auth().updateUser(user.uid, { displayName: String(displayName).trim(), password: String(password), disabled: false });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error.code !== 'auth/user-not-found') throw error;
      user = await admin.auth().createUser({ email: normalizedEmail, password: String(password), displayName: String(displayName).trim(), disabled: false });
    }
    const claims = staffClaims({ existingClaims: user.customClaims, role, doctorId, forcePasswordChange: true });
    await admin.auth().setCustomUserClaims(user.uid, claims);
    await admin.auth().revokeRefreshTokens(user.uid);
    await db.collection('staffProfiles').doc(user.uid).set({ uid: user.uid, email: normalizedEmail, name: String(displayName).trim(), role, doctorId: role === 'doctor' ? doctorId : null, active: true, requiresPasswordChange: true, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid, createdAt: FieldValue.serverTimestamp() }, { merge: true });
    await auditStaffAccess({ actorUid: request.auth.uid, action: 'staff_provisioned', targetUid: user.uid, meta: { role, doctorId: role === 'doctor' ? doctorId : null } });
    return { uid: user.uid, message: 'Staff account provisioned. The temporary password must be changed at first sign-in.' };
  }
  const user = await admin.auth().getUserByEmail(normalizedEmail);
  if (!isStaffRole(user.customClaims?.role)) throw new HttpsError('failed-precondition', 'This account is not a managed staff account.');
  if (action === 'updateAccess') {
    if (!isStaffRole(role) || !String(displayName).trim()) throw new HttpsError('invalid-argument', 'Enter a name and valid staff role.');
    if (role === 'doctor' && !isDoctorId(doctorId)) throw new HttpsError('invalid-argument', 'Enter a stable doctor ID using letters, numbers, hyphens, or underscores.');
    await preventSelfOrLastAdminLockout({ actorUid: request.auth.uid, target: user, nextRole: role, nextDisabled: user.disabled });
    await admin.auth().updateUser(user.uid, { displayName: String(displayName).trim() });
    await admin.auth().setCustomUserClaims(user.uid, staffClaims({ existingClaims: user.customClaims, role, doctorId, forcePasswordChange: Boolean(user.customClaims?.forcePasswordChange) }));
    await admin.auth().revokeRefreshTokens(user.uid);
    await db.collection('staffProfiles').doc(user.uid).set({ uid: user.uid, email: normalizedEmail, name: String(displayName).trim(), role, doctorId: role === 'doctor' ? doctorId : null, active: !user.disabled, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true });
    await auditStaffAccess({ actorUid: request.auth.uid, action: 'staff_access_updated', targetUid: user.uid, meta: { role, doctorId: role === 'doctor' ? doctorId : null } });
    return { message: 'Staff access updated and active sessions were revoked.' };
  }
  if (action === 'temporaryPassword') {
    if (!isStrongTemporaryPassword(password)) throw new HttpsError('invalid-argument', 'Temporary password must have at least 8 characters, uppercase and lowercase letters, a number, and ! @ # or $.');
    await admin.auth().updateUser(user.uid, { password: String(password) });
    await admin.auth().setCustomUserClaims(user.uid, { ...user.customClaims, forcePasswordChange: true });
    await admin.auth().revokeRefreshTokens(user.uid);
    await db.collection('staffProfiles').doc(user.uid).set({ requiresPasswordChange: true, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true });
    await auditStaffAccess({ actorUid: request.auth.uid, action: 'staff_temporary_password_set', targetUid: user.uid });
    return { message: 'Temporary password set. Existing sessions were revoked; share it through a secure channel.' };
  }
  if (action === 'disable') {
    const nextDisabled = Boolean(disabled);
    await preventSelfOrLastAdminLockout({ actorUid: request.auth.uid, target: user, nextRole: user.customClaims?.role, nextDisabled });
    await admin.auth().updateUser(user.uid, { disabled: nextDisabled });
    await admin.auth().revokeRefreshTokens(user.uid);
    await db.collection('staffProfiles').doc(user.uid).set({ active: !Boolean(disabled), updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true });
    await auditStaffAccess({ actorUid: request.auth.uid, action: nextDisabled ? 'staff_suspended' : 'staff_restored', targetUid: user.uid });
    return { message: nextDisabled ? 'Staff account suspended and active sessions were revoked.' : 'Staff account restored.' };
  }
  if (action === 'revokeSessions') {
    if (user.uid === request.auth.uid) throw new HttpsError('failed-precondition', 'Use the sign-out control for your own session.');
    await admin.auth().revokeRefreshTokens(user.uid);
    await auditStaffAccess({ actorUid: request.auth.uid, action: 'staff_sessions_revoked', targetUid: user.uid });
    return { message: 'Active refresh sessions were revoked. Existing ID tokens expire within one hour.' };
  }
  throw new HttpsError('invalid-argument', 'Unsupported staff account action.');
});

// Imports only accounts that already carry a trusted staff custom claim. It never
// grants a role and exists to migrate the original command-created staff accounts
// into the protected directory before stricter lifecycle enforcement is enabled.
exports.syncManagedStaffDirectory = onCall({ ...callableOptions }, async (request) => {
  requireAdmin(request);
  let pageToken;
  let imported = 0;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    const batch = db.batch();
    page.users.filter((user) => isStaffRole(user.customClaims?.role)).forEach((user) => {
      const role = user.customClaims.role;
      batch.set(db.collection('staffProfiles').doc(user.uid), {
        uid: user.uid,
        email: user.email || '',
        name: user.displayName || '',
        role,
        doctorId: role === 'doctor' ? user.customClaims.doctorId || null : null,
        active: !user.disabled,
        requiresPasswordChange: user.customClaims.forcePasswordChange === true,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.auth.uid,
      }, { merge: true });
      imported += 1;
    });
    await batch.commit();
    pageToken = page.pageToken;
  } while (pageToken);
  await auditStaffAccess({ actorUid: request.auth.uid, action: 'staff_directory_synchronised', targetUid: request.auth.uid, meta: { imported } });
  return { imported };
});

// Public booking reads its catalogue through this narrow contract rather than
// embedding clinic/doctor IDs in the client. It is intentionally provider-agnostic
// so a future database adapter only has to preserve this response shape.
exports.getBookingCatalog = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async () => {
  const [branchSnapshot, departmentSnapshot, doctorSnapshot, configSnapshot, visitTypeSnapshot] = await Promise.all([
    db.collection('branches').get(),
    db.collection('departments').get(),
    db.collection('doctors').get(),
    db.collection('clinic').doc('publicConfig').get(),
    db.collection('visitTypes').orderBy('sortOrder').get(),
  ]);
  const departments = departmentSnapshot.docs.filter((item) => item.get('active') === true && item.get('publicBookingEnabled') === true).map((item) => ({
    id: item.id, branchId: item.get('branchId'), name: trimmed(item.get('name'), 120), description: trimmed(item.get('description'), 300), sortOrder: Number(item.get('sortOrder')) || 0,
  }));
  const doctors = doctorSnapshot.docs.filter((item) => item.get('active') === true && item.get('bookingEnabled') === true).map((item) => ({
    id: item.id, branchId: item.get('branchId'), departmentIds: Array.isArray(item.get('departmentIds')) ? item.get('departmentIds') : [], name: trimmed(item.get('name'), 160), qualification: trimmed(item.get('qualification'), 160),
  }));
  const branches = branchSnapshot.docs.filter((item) => item.get('active') === true).map((item) => ({ id: item.id, name: trimmed(item.get('name'), 120), timezone: item.get('timezone') || 'Asia/Kolkata' }));
  const config = bookingConfig(configSnapshot);
  const collectionVisitTypes = visitTypeSnapshot.docs.filter((item) => item.get('active') === true).map((item) => ({
    id: item.id, label: trimmed(item.get('label'), 80), slug: trimmed(item.get('slug') || item.id, 64),
    description: trimmed(item.get('description'), 300), mode: item.get('mode'), minutes: Number(item.get('minutes')),
    color: item.get('color') || 'blue', pricePaise: item.get('pricePaise') ?? null,
    doctorIds: Array.isArray(item.get('doctorIds')) ? item.get('doctorIds') : [],
    requiresConfirmation: item.get('requiresConfirmation') === true, maxAdvanceDays: Number(item.get('maxAdvanceDays')) || config.bookingWindowDays,
    intakeQuestions: Array.isArray(item.get('intakeQuestions')) ? item.get('intakeQuestions') : [],
  }));
  const visitTypes = collectionVisitTypes.length ? collectionVisitTypes : config.visitTypes.filter((item) => item.active).map((item) => ({ ...item, slug: item.slug || item.id, description: item.description || '', color: item.color || 'blue', pricePaise: item.pricePaise ?? null, doctorIds: item.doctorIds || [], requiresConfirmation: item.requiresConfirmation === true, maxAdvanceDays: item.maxAdvanceDays || config.bookingWindowDays, intakeQuestions: item.intakeQuestions || [] }));
  return { branches, departments, doctors, visitTypes, booking: { bookingWindowDays: config.bookingWindowDays, visitTypes: visitTypes.map(({ id, label, minutes, mode }) => ({ id, label, minutes, mode })) } };
});

const catalogId = (value, label) => {
  const id = trimmed(value, 80);
  if (!/^[a-z][a-z0-9_-]{1,79}$/.test(id)) throw new HttpsError('invalid-argument', `${label} must use lowercase letters, numbers, hyphens, or underscores.`);
  return id;
};
const catalogText = (value, label, max = 160, required = true) => {
  const text = trimmed(value, max);
  if (required && !text) throw new HttpsError('invalid-argument', `${label} is required.`);
  return text;
};

// Public catalog documents are deliberately read-only in Firestore rules. This
// callable gives administrators the narrow, validated write path so a clinic can
// grow beyond the original seed provider without a client-side privilege hole.
exports.getAdminBookingCatalog = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  requireAdmin(request);
  const [branchSnapshot, departmentSnapshot, doctorSnapshot] = await Promise.all([
    db.collection('branches').orderBy('name').get(),
    db.collection('departments').orderBy('sortOrder').get(),
    db.collection('doctors').orderBy('name').get(),
  ]);
  return {
    branches: branchSnapshot.docs.map((item) => ({ id: item.id, name: trimmed(item.get('name'), 120), code: trimmed(item.get('code'), 40), timezone: item.get('timezone') || 'Asia/Kolkata', active: item.get('active') === true })),
    departments: departmentSnapshot.docs.map((item) => ({ id: item.id, branchId: trimmed(item.get('branchId'), 80), name: trimmed(item.get('name'), 120), description: trimmed(item.get('description'), 300), active: item.get('active') === true, publicBookingEnabled: item.get('publicBookingEnabled') === true, sortOrder: Number(item.get('sortOrder')) || 0 })),
    doctors: doctorSnapshot.docs.map((item) => ({ id: item.id, branchId: trimmed(item.get('branchId'), 80), departmentIds: Array.isArray(item.get('departmentIds')) ? item.get('departmentIds').map((value) => trimmed(value, 80)).filter(Boolean) : [], name: trimmed(item.get('name'), 160), qualification: trimmed(item.get('qualification'), 160), active: item.get('active') === true, bookingEnabled: item.get('bookingEnabled') === true })),
  };
});

exports.manageBookingCatalog = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  requireAdmin(request);
  const { action, record = {} } = request.data || {};
  if (action === 'branch') {
    const id = catalogId(record.id, 'Branch ID');
    const payload = { name: catalogText(record.name, 'Branch name', 120), code: catalogText(record.code, 'Branch code', 40), timezone: 'Asia/Kolkata', active: record.active === true, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid };
    await db.collection('branches').doc(id).set(payload, { merge: true });
    await auditStaffAccess({ actorUid: request.auth.uid, action: 'booking_catalog_branch_saved', targetUid: id, meta: { active: payload.active } });
    return { message: 'Branch saved.' };
  }
  if (action === 'department') {
    const id = catalogId(record.id, 'Department ID'); const branchId = catalogId(record.branchId, 'Branch ID');
    if (!(await db.collection('branches').doc(branchId).get()).exists) throw new HttpsError('failed-precondition', 'Choose an existing branch.');
    const sortOrder = Number(record.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) throw new HttpsError('invalid-argument', 'Sort order must be a whole number between 0 and 9999.');
    const payload = { branchId, name: catalogText(record.name, 'Department name', 120), description: catalogText(record.description, 'Description', 300, false), active: record.active === true, publicBookingEnabled: record.publicBookingEnabled === true, sortOrder, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid };
    await db.collection('departments').doc(id).set(payload, { merge: true });
    await auditStaffAccess({ actorUid: request.auth.uid, action: 'booking_catalog_department_saved', targetUid: id, meta: { branchId, active: payload.active, publicBookingEnabled: payload.publicBookingEnabled } });
    return { message: 'Department saved.' };
  }
  if (action === 'doctor') {
    const id = isDoctorId(record.id) ? record.id : catalogId(record.id, 'Doctor ID'); const branchId = catalogId(record.branchId, 'Branch ID');
    const departmentIds = Array.isArray(record.departmentIds) ? [...new Set(record.departmentIds.map((value) => catalogId(value, 'Department ID')))] : [];
    if (!departmentIds.length || departmentIds.length > 12) throw new HttpsError('invalid-argument', 'Choose between one and twelve departments.');
    const [branchSnapshot, ...departmentSnapshots] = await Promise.all([db.collection('branches').doc(branchId).get(), ...departmentIds.map((departmentId) => db.collection('departments').doc(departmentId).get())]);
    if (!branchSnapshot.exists || departmentSnapshots.some((item) => !item.exists || item.get('branchId') !== branchId)) throw new HttpsError('failed-precondition', 'Every selected department must belong to the selected branch.');
    const payload = { branchId, departmentIds, name: catalogText(record.name, 'Doctor name', 160), qualification: catalogText(record.qualification, 'Qualification', 160, false), active: record.active === true, bookingEnabled: record.bookingEnabled === true, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid };
    await db.collection('doctors').doc(id).set(payload, { merge: true });
    await auditStaffAccess({ actorUid: request.auth.uid, action: 'booking_catalog_doctor_saved', targetUid: id, meta: { branchId, active: payload.active, bookingEnabled: payload.bookingEnabled } });
    return { message: 'Doctor saved.' };
  }
  throw new HttpsError('invalid-argument', 'Unsupported catalogue action.');
});

// Visit formats are configuration rather than a client-side convention. This
// keeps the public selector, appointment record and staff video workflow on one
// server-validated contract, and makes a future data-store migration explicit.
exports.getAdminBookingConfiguration = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  requireAdmin(request);
  const config = bookingConfig(await db.collection('clinic').doc('publicConfig').get());
  return { visitTypes: config.visitTypes };
});

exports.saveBookingVisitTypes = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  requireAdmin(request);
  const visitTypes = normaliseVisitTypes(request.data?.visitTypes, { requireAtLeastOne: true });
  await db.collection('clinic').doc('publicConfig').set({ visitTypes, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true });
  await auditStaffAccess({ actorUid: request.auth.uid, action: 'booking_visit_types_saved', targetUid: 'publicConfig', meta: { count: visitTypes.length } });
  return { message: 'Appointment formats saved.', visitTypes };
});

// --- Appointment engine ----------------------------------------------------
// Firestore is the sole appointment authority. Google Calendar is deliberately
// an external busy-time source and best-effort event mirror, never a replacement
// for the transaction below.
const DEFAULT_BOOKING_CONFIG = Object.freeze({
  timezone: 'Asia/Kolkata',
  bookingWindowDays: 14,
  leadMinutes: 30,
  slotMinutes: 20,
  intervalMinutes: 20,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  autoConfirm: false,
  patientCancellationCutoffHours: 2,
});
const DEFAULT_VISIT_TYPES = Object.freeze([
  Object.freeze({ id: 'consultation', label: 'In-clinic consultation', minutes: 20, mode: 'in_person', active: true }),
  Object.freeze({ id: 'video-consultation', label: 'Online video consultation', minutes: 20, mode: 'video', active: true }),
]);

const asDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Audit records deliberately remain unreadable from the browser in Firestore
// rules. This is the one narrow, admin-only projection used by the operations
// UI; it excludes free-form metadata, which can contain unnecessary personal
// or clinical context.
exports.getAuditLog = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  requireAdmin(request);
  const requestedLimit = Number(request.data?.limit);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 30;
  const snapshot = await db.collection('auditLogs').orderBy('at', 'desc').limit(limit).get();
  const events = snapshot.docs.map((item) => {
    const data = item.data();
    const at = asDate(data.at);
    return {
      id: item.id,
      at: at ? at.toISOString() : null,
      action: trimmed(data.action, 120) || 'activity_recorded',
      actorRole: trimmed(data.actor?.role, 40) || 'system',
      actorUid: trimmed(data.actor?.uid, 200) || null,
      resourceType: trimmed(data.resource?.type, 80) || 'system',
      resourceId: trimmed(data.resource?.id, 200) || null,
      targetUid: trimmed(data.targetUid, 200) || null,
    };
  });
  return { events };
});

// Experience feedback is never public by default. A patient may submit one
// review only after a completed appointment; an administrator must explicitly
// publish it before the public site can receive its minimal projection.
exports.submitPatientFeedback = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  if (!request.auth || isStaffRole(request.auth.token.role)) throw new HttpsError('permission-denied', 'Patient sign-in is required.');
  const appointmentId = String(request.data?.appointmentId || '').trim();
  const rating = Number(request.data?.rating);
  const comment = String(request.data?.comment || '').trim().replace(/\s+/g, ' ').slice(0, 800);
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(appointmentId) || !Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length < 10) throw new HttpsError('invalid-argument', 'Choose a rating and write at least 10 characters of feedback.');
  const appointmentRef = db.collection('appointments').doc(appointmentId);
  const feedbackRef = db.collection('patientFeedback').doc(appointmentId);
  await db.runTransaction(async (transaction) => {
    const [appointment, existing] = await Promise.all([transaction.get(appointmentRef), transaction.get(feedbackRef)]);
    if (!appointment.exists || appointment.get('patientId') !== request.auth.uid || appointment.get('status') !== 'completed') throw new HttpsError('permission-denied', 'Feedback is available after your completed appointment.');
    if (existing.exists) throw new HttpsError('already-exists', 'Feedback was already submitted for this appointment.');
    const now = FieldValue.serverTimestamp();
    transaction.set(feedbackRef, { appointmentId, patientId: request.auth.uid, rating, comment, status: 'pending', createdAt: now, updatedAt: now });
    transaction.set(db.collection('auditLogs').doc(), { at: now, actor: { uid: request.auth.uid, role: 'patient' }, action: 'patient_feedback_submitted', resource: { type: 'patient_feedback', id: feedbackRef.id }, meta: { rating } });
  });
  return { message: 'Thank you. Your feedback has been submitted for review.' };
});

exports.getPublicTestimonials = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async () => {
  const snapshot = await db.collection('patientFeedback').where('status', '==', 'published').orderBy('publishedAt', 'desc').limit(6).get();
  return { testimonials: snapshot.docs.map((item) => ({ id: item.id, rating: item.get('rating'), comment: item.get('comment') })) };
});

exports.getFeedbackModerationQueue = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  requireAdmin(request);
  const snapshot = await db.collection('patientFeedback').where('status', '==', 'pending').orderBy('createdAt', 'desc').limit(30).get();
  return { feedback: snapshot.docs.map((item) => ({ id: item.id, appointmentId: item.get('appointmentId'), rating: item.get('rating'), comment: item.get('comment') })) };
});

exports.moderatePatientFeedback = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  requireAdmin(request);
  const feedbackId = String(request.data?.feedbackId || '').trim();
  const action = String(request.data?.action || '').trim();
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(feedbackId) || !['publish', 'reject', 'unpublish'].includes(action)) throw new HttpsError('invalid-argument', 'Choose a valid feedback moderation action.');
  const ref = db.collection('patientFeedback').doc(feedbackId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Feedback was not found.');
  const status = action === 'publish' ? 'published' : action === 'reject' ? 'rejected' : 'unpublished';
  await ref.set({ status, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: request.auth.uid, publishedAt: action === 'publish' ? FieldValue.serverTimestamp() : FieldValue.delete() }, { merge: true });
  await auditPatientAccess({ actorUid: request.auth.uid, action: `patient_feedback_${status}`, targetUid: snapshot.get('patientId'), meta: { feedbackId } });
  return { message: `Feedback ${status}.` };
});

const publicError = (code, message) => new HttpsError(code, message);
const roleFor = (authContext) => authContext?.token?.role || 'patient';
const trimmed = (value, max) => String(value || '').trim().slice(0, max);
const validPhone = (value) => /^\+?[0-9][0-9\s-]{6,18}$/.test(String(value || '').trim());
const validClientRequestId = (value) => /^[a-zA-Z0-9_-]{16,128}$/.test(String(value || ''));

const functionsProject = () => process.env.GCLOUD_PROJECT || 'sood-clinic';
const googleCallbackUrl = () => `https://asia-south1-${functionsProject()}.cloudfunctions.net/googleCalendarCallback`;
const BOOKING_RATE_LIMIT = 10;
// Spec 6: holds are cheap and thrown away on every page interaction, so they get a wider
// hourly allowance than a booking itself.
const HOLD_RATE_LIMIT = 20;
const BOOKING_RATE_WINDOW_MS = 60 * 60 * 1000;

// Callers are identified by a truncated hash of their IP: the raw address is never stored,
// and the same hash is what appointmentPrivate keeps for abuse triage (§4.3b).
const requestIpHash = (request) => crypto.createHash('sha256').update(String(request.rawRequest?.ip || '')).digest('hex').slice(0, 32);

// Spec 6 gives each callable its own hourly allowance (booking 10, hold 20, …). One shared
// counter for every callable meant a guest who held a few times could not book at all, so
// the bucket is part of the document id.
const enforceRateLimit = async (request, { bucket, limit }) => {
  const rateLimitRef = db.collection('rateLimits').doc(`${bucket}_${requestIpHash(request)}`);
  const now = new Date();
  const resetAt = new Date(now.getTime() + BOOKING_RATE_WINDOW_MS);

  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(rateLimitRef);
    const existingResetAt = asDate(existing.get('resetAt'));
    const count = existing.exists && existingResetAt && existingResetAt > now
      ? Number(existing.get('count')) || 0
      : 0;
    if (count >= limit) {
      throw publicError('resource-exhausted', 'Too many booking attempts. Please try again in an hour.');
    }
    transaction.set(rateLimitRef, {
      count: count + 1,
      resetAt: Timestamp.fromDate(resetAt),
    });
  });
};

const enforceBookingRateLimit = (request) => enforceRateLimit(request, { bucket: 'booking', limit: BOOKING_RATE_LIMIT });

const assertPhoneBookingCapacity = async (phoneKey, now = new Date()) => {
  const activeBookings = await db.collection('appointments')
    .where('phoneKey', '==', phoneKey)
    .where('status', 'in', ['scheduled', 'confirmed'])
    .where('startsAt', '>', Timestamp.fromDate(now))
    .limit(2)
    .get();
  if (activeBookings.size >= 2) {
    throw publicError('resource-exhausted', 'You already have two upcoming appointments. Please contact the clinic to make another booking.');
  }
};

// One safe message per validator reason; the UI maps error.details.reason to its own copy (A0-07).
const BOOKING_INPUT_MESSAGES = Object.freeze({
  INVALID_PHONE: 'Enter a valid Indian mobile number.',
  INVALID_EMAIL: 'Enter a valid email address.',
  CONSENT_REQUIRED: 'Please accept the consent to continue.',
  VALIDATION: 'Please check the highlighted fields.',
});

const bookingConfig = (data) => {
  const configured = data?.data() || {};
  const number = (name, fallback, min, max) => Number.isInteger(configured[name]) && configured[name] >= min && configured[name] <= max ? configured[name] : fallback;
  return {
    ...DEFAULT_BOOKING_CONFIG,
    bookingWindowDays: number('bookingWindowDays', DEFAULT_BOOKING_CONFIG.bookingWindowDays, 1, 90),
    leadMinutes: number('leadMinutes', DEFAULT_BOOKING_CONFIG.leadMinutes, 0, 24 * 60),
    slotMinutes: number('slotMinutes', DEFAULT_BOOKING_CONFIG.slotMinutes, 5, 240),
    intervalMinutes: number('intervalMinutes', DEFAULT_BOOKING_CONFIG.intervalMinutes, 5, 240),
    bufferBeforeMinutes: number('bufferBeforeMinutes', DEFAULT_BOOKING_CONFIG.bufferBeforeMinutes, 0, 120),
    bufferAfterMinutes: number('bufferAfterMinutes', DEFAULT_BOOKING_CONFIG.bufferAfterMinutes, 0, 120),
    autoConfirm: configured.autoConfirm === true,
    patientCancellationCutoffHours: number('patientCancellationCutoffHours', DEFAULT_BOOKING_CONFIG.patientCancellationCutoffHours, 0, 168),
    visitTypes: normaliseVisitTypes(configured.visitTypes),
  };
};

const normaliseVisitTypes = (value, { requireAtLeastOne = false } = {}) => {
  const configured = Array.isArray(value) && value.length ? value : DEFAULT_VISIT_TYPES;
  if (!Array.isArray(configured) || configured.length > 12) throw new HttpsError('invalid-argument', 'Choose between one and twelve appointment formats.');
  const seen = new Set();
  const types = configured.map((item) => {
    const id = catalogId(item?.id, 'Appointment format ID');
    if (seen.has(id)) throw new HttpsError('invalid-argument', 'Appointment format IDs must be unique.');
    seen.add(id);
    const label = catalogText(item?.label, 'Appointment format label', 100);
    const minutes = Number(item?.minutes);
    if (!Number.isInteger(minutes) || minutes < 5 || minutes > 240) throw new HttpsError('invalid-argument', 'Appointment duration must be between 5 and 240 minutes.');
    const mode = item?.mode === 'video' ? 'video' : item?.mode === 'in_person' || !item?.mode ? 'in_person' : null;
    if (!mode) throw new HttpsError('invalid-argument', 'Appointment format must be in-clinic or video.');
    return { id, label, minutes, mode, active: item?.active !== false };
  });
  const active = types.filter((item) => item.active);
  if (requireAtLeastOne && !active.length) throw new HttpsError('invalid-argument', 'Keep at least one appointment format available.');
  return types;
};

const visitTypeFor = (config, visitTypeId) => {
  const visitType = config.visitTypes.find((item) => item.id === visitTypeId && item.active);
  if (visitType) return visitType;
  if (visitTypeId && visitTypeId !== 'consultation') throw publicError('invalid-argument', 'The selected appointment format is unavailable.');
  return config.visitTypes.find((item) => item.id === 'consultation' && item.active) || { id: 'consultation', label: 'In-clinic consultation', minutes: config.slotMinutes, mode: 'in_person', active: true };
};

// One lock document per five-minute unit. A legacy single-slot document (written
// before unit locking) is expanded to the units it covers, so both shapes block
// availability until the migration script has run.
const dayOccupiedUnits = async (doctorId, dateKey, now) => {
  const snapshot = await db.collection('appointmentSlots').where('doctorId', '==', doctorId).where('dateKey', '==', dateKey).get();
  const occupied = new Set();
  snapshot.docs.forEach((document) => {
    const unit = document.data();
    const expiresAt = asDate(unit.expiresAt);
    if (expiresAt && expiresAt.getTime() <= now.getTime()) return;
    if (unit.kind) {
      occupied.add(document.id);
      return;
    }
    const startsAt = asDate(unit.startsAt);
    const endsAt = asDate(unit.endsAt);
    if (!startsAt || !endsAt) {
      occupied.add(document.id);
      return;
    }
    unitSlotsForRange(doctorId, startsAt, endsAt).forEach((slot) => occupied.add(slot.id));
  });
  return occupied;
};

// §6.6 wants an ISO `startsAt`. The interim `dateKey` + `time` pair the deployed page used
// to send is no longer read: A1-03 moved the page and the hold callables to the contract
// (`startsAt`, `holdId`, `consent`).
const bookingStartsAt = (data) => {
  const iso = typeof data?.startsAt === 'string' ? data.startsAt.trim() : '';
  if (!iso) return null;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// §4.3 wants the clinic registry id on the appointment when the booking matches a known
// patient. The registry is phone-keyed, so the lookup stays server-side.
const patientRegistryIdForPhone = async (phoneKey) => {
  const normalized = normalizePhone(phoneKey);
  if (!normalized) return null;
  const snapshot = await db.collection('patientDirectory').where('phoneNormalized', '==', normalized).limit(1).get();
  const uhid = snapshot.empty ? '' : String(snapshot.docs[0].get('uhid') || '');
  return isUhid(uhid) ? uhid : null;
};

const appointmentUnitIds = (appointment) => (Array.isArray(appointment?.slotIds) && appointment.slotIds.length
  ? appointment.slotIds
  : (appointment?.slotId ? [appointment.slotId] : []));

const slotForTime = (dateKey, time, minutes) => {
  const startsAt = istInstant(dateKey, time);
  return { startsAt, endsAt: new Date(startsAt.getTime() + minutes * 60 * 1000), time };
};

const istTimeOf = (value) => {
  const date = asDate(value);
  if (!date) return null;
  const { hour, minute } = toIstParts(date);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const blockBusyRanges = async (doctorId, dateKey) => {
  const snapshot = await db.collection('calendarBlocks')
    .where('doctorId', '==', doctorId)
    .where('dateKey', '==', dateKey)
    .get();
  return snapshot.docs.map((item) => item.data()).map((item) => {
    const startsAt = asDate(item.startsAt);
    const endsAt = asDate(item.endsAt);
    return startsAt && endsAt ? { startsAt, endsAt } : null;
  }).filter(Boolean);
};

const calendarConnection = async (doctorId) => {
  const snapshot = await db.collection('integrations').doc('googleCalendar').get();
  const connection = snapshot.data();
  if (!snapshot.exists || !connection.active || connection.doctorId !== doctorId || !connection.encryptedRefreshToken) return null;
  return { ref: snapshot.ref, ...connection };
};

const calendarAccess = async (connection) => {
  const refreshToken = decrypt(connection.encryptedRefreshToken, GOOGLE_CALENDAR_TOKEN_KEY.value());
  const token = await refreshAccessToken({ refreshToken, clientId: GOOGLE_CALENDAR_CLIENT_ID.value(), clientSecret: GOOGLE_CALENDAR_CLIENT_SECRET.value() });
  return { accessToken: token.access_token, calendarId: connection.calendarId || 'primary' };
};

// One free/busy request covers a day or a whole month, so month availability does not
// need one Google call per day.
const externalBusyRanges = async ({ doctorId, fromDateKey, toDateKey = fromDateKey }) => {
  const connection = await calendarConnection(doctorId);
  if (!connection) return { ranges: [], calendar: { connected: false } };
  try {
    const { accessToken, calendarId } = await calendarAccess(connection);
    const start = new Date(`${fromDateKey}T00:00:00+05:30`);
    const end = new Date(new Date(`${toDateKey}T00:00:00+05:30`).getTime() + 24 * 60 * 60 * 1000);
    const ranges = await freeBusy({ accessToken, calendarId, timeMin: start.toISOString(), timeMax: end.toISOString() });
    await connection.ref.set({ syncStatus: 'healthy', lastAvailabilitySyncAt: FieldValue.serverTimestamp(), lastSyncError: FieldValue.delete() }, { merge: true });
    return { ranges, calendar: { connected: true, status: 'healthy' } };
  } catch (_error) {
    // Do not reveal provider detail or fail the clinic's own booking system if
    // Google is temporarily unavailable. The server records only a safe status.
    await connection.ref.set({ syncStatus: 'degraded', lastSyncError: 'Unable to refresh external calendar availability.', lastSyncErrorAt: FieldValue.serverTimestamp() }, { merge: true });
    return { ranges: [], calendar: { connected: true, status: 'degraded' } };
  }
};

// Visit-type timing lives on each visit type. The collection is the source of truth;
// until the migration has run, the legacy clinic/publicConfig values are used so
// availability and booking keep behaving exactly as before.
const storedVisitTypeTiming = async (visitTypeId) => {
  const id = trimmed(visitTypeId, 120);
  if (!id) return null;
  const snapshot = await db.collection('visitTypes').doc(id).get();
  if (!snapshot.exists || snapshot.get('active') === false) return null;
  const data = snapshot.data();
  const number = (name, fallback) => (Number.isFinite(Number(data[name])) ? Number(data[name]) : fallback);
  const minutes = number('minutes', DEFAULT_BOOKING_CONFIG.slotMinutes);
  return {
    id: snapshot.id,
    label: String(data.label || snapshot.id).slice(0, 100),
    mode: data.mode === 'video' ? 'video' : 'in_person',
    minutes,
    bufferBeforeMinutes: number('bufferBeforeMinutes', 0),
    bufferAfterMinutes: number('bufferAfterMinutes', 0),
    minNoticeMinutes: number('minNoticeMinutes', DEFAULT_BOOKING_CONFIG.leadMinutes),
    maxAdvanceDays: number('maxAdvanceDays', DEFAULT_BOOKING_CONFIG.bookingWindowDays),
    intervalMinutes: number('intervalMinutes', minutes),
    dailyLimit: Number.isInteger(data.dailyLimit) ? data.dailyLimit : null,
    requiresConfirmation: data.requiresConfirmation !== false,
  };
};

const legacyVisitTypeTiming = (config, visitTypeId) => {
  const visitType = visitTypeFor(config, visitTypeId);
  return {
    id: visitType.id,
    label: visitType.label,
    mode: visitType.mode,
    minutes: visitType.minutes,
    bufferBeforeMinutes: config.bufferBeforeMinutes,
    bufferAfterMinutes: config.bufferAfterMinutes,
    minNoticeMinutes: config.leadMinutes,
    maxAdvanceDays: config.bookingWindowDays,
    intervalMinutes: config.intervalMinutes,
    dailyLimit: null,
    requiresConfirmation: !config.autoConfirm,
  };
};

const resolveVisitType = async ({ config, visitTypeId }) => (await storedVisitTypeTiming(visitTypeId))
  || legacyVisitTypeTiming(config, visitTypeId);

const dayActiveAppointmentCount = async ({ doctorId, dateKey, visitTypeId }) => {
  const snapshot = await db.collection('appointments').where('doctorId', '==', doctorId).where('dateKey', '==', dateKey).get();
  return snapshot.docs.filter((document) => isActiveAppointment(document.get('status')) && document.get('visitType') === visitTypeId).length;
};

const loadPublicBookingConfig = async () => bookingConfig(await db.collection('clinic').doc('publicConfig').get());

const availabilityContext = async ({ doctorId, dateKey, visitTypeId, now = new Date() }) => {
  const [doctorSnapshot, scheduleSnapshot, exceptionSnapshot, config] = await Promise.all([
    db.collection('doctors').doc(doctorId).get(),
    db.collection('doctorSchedules').doc(doctorId).get(),
    db.collection('scheduleExceptions').doc(`${doctorId}_${dateKey}`).get(),
    loadPublicBookingConfig(),
  ]);
  if (!doctorSnapshot.exists || doctorSnapshot.get('active') !== true || doctorSnapshot.get('bookingEnabled') !== true) throw publicError('not-found', 'This doctor is not currently available for online bookings.');
  const visitType = await resolveVisitType({ config, visitTypeId });
  const [occupiedUnitIds, blocks, external, activeCountForType] = await Promise.all([
    dayOccupiedUnits(doctorId, dateKey, now),
    blockBusyRanges(doctorId, dateKey),
    externalBusyRanges({ doctorId, fromDateKey: dateKey }),
    dayActiveAppointmentCount({ doctorId, dateKey, visitTypeId: visitType.id }),
  ]);
  return {
    doctor: doctorSnapshot.data(),
    weeklySessions: (scheduleSnapshot.get('sessions') || doctorSnapshot.get('weeklySchedule') || []).map((session) => ({
      weekday: session.weekday,
      start: session.start || session.startTime,
      end: session.end || session.endTime,
    })),
    exception: exceptionSnapshot.exists ? exceptionSnapshot.data() : null,
    config,
    visitType,
    blocks: [...blocks, ...external.ranges],
    occupiedUnitIds,
    activeCountForType,
    externalCalendar: external.calendar,
  };
};

// The engine stays pure: the clock and every unit lock are loaded above and passed in.
// Staff moves bypass the patient notice period.
const daySlotsFor = ({ doctorId, context, dateKey, now, ignoreNotice = false }) => computeDaySlots({
  dateKey,
  now,
  doctorId,
  visitType: ignoreNotice ? { ...context.visitType, minNoticeMinutes: 0 } : context.visitType,
  weeklySessions: context.weeklySessions,
  exception: context.exception,
  blocks: context.blocks,
  occupiedUnitIds: context.occupiedUnitIds,
  activeCountForType: context.activeCountForType,
});

exports.getAvailability = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB', secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_KEY] }, async (request) => {
  const { doctorId, dateKey, visitTypeId } = request.data || {};
  if (!doctorId || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) throw publicError('invalid-argument', 'Choose a doctor and appointment date.');
  const now = new Date();
  const context = await availabilityContext({ doctorId, dateKey, visitTypeId, now });
  return {
    timezone: context.config.timezone,
    visitType: { id: context.visitType.id, label: context.visitType.label, minutes: context.visitType.minutes, mode: context.visitType.mode },
    calendar: context.externalCalendar,
    slots: daySlotsFor({ doctorId, context, dateKey, now }).map((slot) => ({
      slotId: istUnitId(doctorId, slot.startsAt),
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      time: slot.time,
    })),
  };
});

// The month-wide public availability callable loads each source once per month, so it lives
// in its own module (spec 6.2) with the clinic-specific loaders handed in.
Object.assign(exports, createAvailabilityCallables({
  db,
  callableOptions: { ...callableOptions, secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_KEY] },
  loadConfig: loadPublicBookingConfig,
  resolveVisitType,
  loadExternalBusy: externalBusyRanges,
}));

// Holds lock five-minute units for a guest who is still filling in their details (spec 6.4-6.5).
// The module is handed the same day-context loader and pure engine the availability callables
// use, so a hold and a booking can never disagree about whether a time is offered.
const holdHandlers = createHoldHandlers({
  db,
  loadDayContext: availabilityContext,
  slotsForDay: daySlotsFor,
  rateLimit: (request) => enforceRateLimit(request, { bucket: 'hold', limit: HOLD_RATE_LIMIT }),
  hashToken,
});

exports.holdSlot = onCall({ ...callableOptions, timeoutSeconds: 20, memory: '256MiB', secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_KEY] }, holdHandlers.holdSlot);

exports.releaseHold = onCall({ ...callableOptions, timeoutSeconds: 20, memory: '256MiB' }, holdHandlers.releaseHold);

// Calendar identifiers name the clinic's external calendar, and the creator's uid names a
// staff member. Neither belongs on the appointment, which the owning patient can read, so
// both live on the server-only appointmentPrivate document.
const appointmentPrivateRef = (appointmentId) => db.collection('appointmentPrivate').doc(appointmentId);

const calendarIdsFrom = (internals, appointment) => ({
  calendarId: internals?.calendarId || appointment?.externalCalendar?.calendarId || null,
  eventId: internals?.eventId || appointment?.externalCalendar?.eventId || null,
});

const publicSyncState = ({ syncStatus, lastSyncError = null }) => (lastSyncError
  ? { provider: 'google', syncStatus, lastSyncError }
  : { provider: 'google', syncStatus });

// Appointments created before this move still carry their calendar identifiers on the
// appointment itself. They are read once and copied into appointmentPrivate so the
// clinic's Google events are never orphaned.
const appointmentCalendarIds = async (appointmentId, appointment) => {
  const snapshot = await appointmentPrivateRef(appointmentId).get();
  const stored = snapshot.exists ? snapshot.data() : {};
  const ids = calendarIdsFrom(stored, appointment);
  if (ids.eventId && stored.eventId !== ids.eventId) await appointmentPrivateRef(appointmentId).set(ids, { merge: true });
  return ids;
};

const syncAppointmentToGoogle = async (appointmentId) => {
  const appointmentRef = db.collection('appointments').doc(appointmentId);
  const appointmentSnapshot = await appointmentRef.get();
  if (!appointmentSnapshot.exists) return;
  const appointment = appointmentSnapshot.data();
  const connection = await calendarConnection(appointment.doctorId);
  if (!connection) return;
  try {
    const { accessToken, calendarId } = await calendarAccess(connection);
    const event = await createEvent({ accessToken, calendarId, startsAt: asDate(appointment.startsAt).toISOString(), endsAt: asDate(appointment.endsAt).toISOString(), appointmentReference: appointment.reference });
    await appointmentPrivateRef(appointmentId).set({ calendarId, eventId: event.id }, { merge: true });
    await appointmentRef.set({ externalCalendar: { ...publicSyncState({ syncStatus: 'synced' }), lastSyncedAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch (_error) {
    await appointmentRef.set({ externalCalendar: publicSyncState({ syncStatus: 'pending', lastSyncError: 'Calendar event could not be synced.' }), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
};

const deleteAppointmentFromGoogle = async ({ ref, appointment }) => {
  const ids = await appointmentCalendarIds(ref.id, appointment);
  if (!ids.eventId) return;
  try {
    const connection = await calendarConnection(appointment.doctorId);
    if (!connection) return;
    const { accessToken, calendarId } = await calendarAccess(connection);
    await deleteEvent({ accessToken, calendarId: ids.calendarId || calendarId, eventId: ids.eventId });
    await appointmentPrivateRef(ref.id).set({ calendarId: FieldValue.delete(), eventId: FieldValue.delete() }, { merge: true });
    await ref.set({ externalCalendar: { ...publicSyncState({ syncStatus: 'deleted' }), lastSyncedAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch (_error) {
    await ref.set({ externalCalendar: publicSyncState({ syncStatus: 'pending', lastSyncError: 'Calendar event could not be removed.' }), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
};

exports.createBooking = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB', secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_KEY] }, async (request) => {
  const data = request.data || {};
  const doctorId = trimmed(data.doctorId, 120);
  const visitTypeId = trimmed(data.visitTypeId, 120);
  if (!doctorId || !visitTypeId) throw publicError('invalid-argument', 'Choose a doctor and appointment format.');
  if (!validClientRequestId(data.clientRequestId)) throw publicError('invalid-argument', 'Please refresh and try booking again.');
  const startsAt = bookingStartsAt(data);
  if (!startsAt) throw publicError('invalid-argument', 'Choose a valid appointment time.');
  // A retry of the same request (double submit, network retry) returns the original booking
  // instead of failing on the availability the first attempt already consumed.
  const requestRef = db.collection('bookingRequests').doc(data.clientRequestId);
  const priorRequest = await requestRef.get();
  if (priorRequest.exists) {
    return { appointmentId: priorRequest.get('appointmentId'), reference: priorRequest.get('reference'), status: priorRequest.get('status'), idempotent: true };
  }
  const now = new Date();
  const dateKey = istDateKey(startsAt);
  const time = istTimeOf(startsAt);
  // The visit type is resolved before the patient details: §6.6 validation depends on it (the
  // intake questions), and availabilityContext re-checks the doctor and resolves it again for the day.
  const config = await loadPublicBookingConfig();
  const visitType = await resolveVisitType({ config, visitTypeId });
  const validated = validateBookingInput(data, visitType, { now });
  if (!validated.ok) {
    throw schedulerError('invalid-argument', validated.reason, BOOKING_INPUT_MESSAGES[validated.reason] || BOOKING_INPUT_MESSAGES.VALIDATION);
  }
  const { name, phone, phoneKey, email, emailLower, dob, ageYears, sex, visitKind, reason, intake } = validated.value;
  await enforceBookingRateLimit(request);
  await assertPhoneBookingCapacity(phoneKey, now);
  const context = await availabilityContext({ doctorId, dateKey, visitTypeId, now });
  // §6.6: the client's own random hold id, hashed before it is compared with the units.
  const holdId = trimmed(data.holdId, 64);
  const claimHoldId = isHoldId(holdId) ? hashToken(holdId) : null;
  const appointmentSlots = daySlotsFor({ doctorId, context, dateKey, now });
  let requested = appointmentSlots.find((slot) => slot.time === time);
  if (!requested && claimHoldId) {
    const candidate = slotForTime(dateKey, time, context.visitType.minutes);
    const held = await unitsHeldBy({
      db,
      doctorId,
      startsAt: candidate.startsAt,
      endsAt: candidate.endsAt,
      bufferBefore: context.visitType.bufferBeforeMinutes,
      bufferAfter: context.visitType.bufferAfterMinutes,
      claimHoldId,
      now,
    });
    if (held) requested = candidate;
  }
  // §6.6 dropped branchId/departmentId from the input: the patient picks a doctor, and the
  // doctor's own branch and primary department keep the stored appointment shape unchanged.
  // availabilityContext has already refused a doctor who is not active and publicly bookable.
  const branchId = trimmed(context.doctor.branchId, 80) || null;
  const departmentId = (context.doctor.departmentIds || [])[0] || null;
  const patientRegistryId = await patientRegistryIdForPhone(phoneKey);

  const exceptionRef = db.collection('scheduleExceptions').doc(`${doctorId}_${dateKey}`);
  const appointmentRef = db.collection('appointments').doc();
  const queueRef = db.collection('counters').doc(`queue_${doctorId}_${dateKey}`);
  if (!requested) throw schedulerError('failed-precondition', 'SLOT_UNAVAILABLE', 'That time is no longer available. Please choose another slot.');
  const reference = newReference();
  const manageToken = newManageToken();
  const manageTokenHash = hashToken(manageToken);
  const role = roleFor(request.auth);
  let result;
  try {
    await db.runTransaction(async (transaction) => {
      const [prior, currentException] = await Promise.all([transaction.get(requestRef), transaction.get(exceptionRef)]);
      if (prior.exists) {
        result = { appointmentId: prior.get('appointmentId'), reference: prior.get('reference'), status: prior.get('status'), idempotent: true };
        return;
      }
      if (currentException.exists && currentException.get('type') === 'closed') throw schedulerError('failed-precondition', 'SLOT_UNAVAILABLE', 'This clinic day has just been closed. Please choose another time.');
      const status = context.visitType.requiresConfirmation ? 'scheduled' : 'confirmed';
      const createdBy = request.auth ? { uid: request.auth.uid, role } : { uid: null, role: 'public' };
      const unitIds = await placeAppointmentInTransaction({
        db,
        transaction,
        doctorId,
        startsAt: requested.startsAt,
        endsAt: requested.endsAt,
        bufferBefore: context.visitType.bufferBeforeMinutes,
        bufferAfter: context.visitType.bufferAfterMinutes,
        appointmentRef,
        visitTypeId: context.visitType.id,
        claimHoldId,
        now,
      });
      const source = request.auth ? 'portal' : 'web';
      transaction.set(appointmentRef, {
        reference, branchId, departmentId, doctorId,
        // visitType/visitMode stay for the readers that predate §4.3 (queue counters, portal, staff lists).
        visitTypeId: context.visitType.id, visitType: context.visitType.id, visitTypeLabel: context.visitType.label,
        visitMode: context.visitType.mode,
        durationMinutes: context.visitType.minutes,
        bufferBeforeMinutes: context.visitType.bufferBeforeMinutes,
        bufferAfterMinutes: context.visitType.bufferAfterMinutes,
        dateKey,
        startsAt: Timestamp.fromDate(requested.startsAt), endsAt: Timestamp.fromDate(requested.endsAt),
        status, source, patientId: request.auth?.uid || null, patientRegistryId,
        patientSnapshot: { name, phone, sex, ageYears, dob, visitKind, email },
        phoneKey,
        contact: { email, emailLower, phoneKey },
        intake,
        reason,
        tokenNumber: null, checkedInAt: null, startedAt: null, completedAt: null,
        reminders: { t24h: null, t2h: null },
        slotIds: unitIds,
        consent: { version: CONSENT_VERSION, acceptedAt: FieldValue.serverTimestamp() },
        externalCalendar: publicSyncState({ syncStatus: 'not_connected' }),
        videoConsultation: context.visitType.mode === 'video' ? { status: 'awaiting_link' } : null,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(appointmentPrivateRef(appointmentRef.id), { appointmentId: appointmentRef.id, manageTokenHash, manageCreatedAt: FieldValue.serverTimestamp(), createdByUid: createdBy.uid, ipHash: requestIpHash(request) });
      // The reference index guarantees a unique reference and lets the token flow resolve it.
      transaction.create(db.collection('bookingReferences').doc(reference), { appointmentId: appointmentRef.id, createdAt: FieldValue.serverTimestamp() });
      transaction.set(appointmentRef.collection('events').doc(), { from: null, to: status, byUid: createdBy.uid, byRole: createdBy.role, at: FieldValue.serverTimestamp(), meta: { source } });
      transaction.set(db.collection('auditLogs').doc(), { at: FieldValue.serverTimestamp(), actor: createdBy, action: 'appointment_created', resource: { type: 'appointment', id: appointmentRef.id }, meta: { source, status } });
      transaction.set(requestRef, { appointmentId: appointmentRef.id, reference, status, createdAt: FieldValue.serverTimestamp() });
      result = {
        appointmentId: appointmentRef.id,
        reference,
        status,
        idempotent: false,
        startsAt: requested.startsAt.toISOString(),
        endsAt: requested.endsAt.toISOString(),
        // Returned once, never stored in clear (§6.6).
        manageToken,
        visitType: { id: context.visitType.id, label: context.visitType.label, mode: context.visitType.mode, minutes: context.visitType.minutes },
        doctor: { name: trimmed(context.doctor.name, 160) },
      };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw publicError('internal', 'We could not reserve this time. Please try again.');
  }
  if (!result.idempotent) {
    // After the transaction commits, in the order spec 5.4 sets: outbox first, then the calendar.
    await enqueueForAppointment('booking_confirmed', result.appointmentId);
    await syncAppointmentToGoogle(result.appointmentId);
  }
  return result;
});

const publicAppointmentView = (appointment) => ({
  reference: appointment.reference,
  appointmentId: appointment.id,
  doctorId: appointment.doctorId,
  dateKey: appointment.dateKey,
  startsAt: asDate(appointment.startsAt)?.toISOString() || null,
  endsAt: asDate(appointment.endsAt)?.toISOString() || null,
  status: appointment.status,
  visitType: appointment.visitType,
  visitMode: appointment.visitMode,
  patientName: appointment.patientSnapshot?.name || '',
});

const findGuestAppointment = async (reference, token) => {
  const cleanReference = trimmed(reference, 32).toUpperCase();
  const cleanToken = trimmed(token, 200);
  if (!/^SC-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/.test(cleanReference) || cleanToken.length < 20) throw publicError('not-found', 'We could not find this booking.');
  const snapshot = await db.collection('appointments').where('reference', '==', cleanReference).limit(1).get();
  if (!snapshot.size) throw publicError('not-found', 'We could not find this booking.');
  const appointment = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
  const privateSnapshot = await db.collection('appointmentPrivate').doc(appointment.id).get();
  const tokenHash = privateSnapshot.get('manageTokenHash') || appointment.manageTokenHash;
  if (!tokensEqual(tokenHash, hashToken(cleanToken))) throw publicError('not-found', 'We could not find this booking.');
  return { ref: snapshot.docs[0].ref, appointment };
};

exports.getBookingByToken = onCall({ ...callableOptions, timeoutSeconds: 20, memory: '256MiB' }, async (request) => {
  await enforceBookingRateLimit(request);
  const { appointment } = await findGuestAppointment(request.data?.reference, request.data?.token);
  return publicAppointmentView(appointment);
});

exports.cancelBookingByToken = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB', secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_KEY] }, async (request) => {
  await enforceBookingRateLimit(request);
  const { ref, appointment } = await findGuestAppointment(request.data?.reference, request.data?.token);
  const reason = trimmed(request.data?.reason, 300) || 'Cancelled online by patient';
  const config = bookingConfig(await db.collection('clinic').doc('publicConfig').get());
  if (!canPatientCancel({ appointment, uid: null, cutoffHours: config.patientCancellationCutoffHours, allowGuest: true })) throw publicError('failed-precondition', 'This appointment can no longer be cancelled online. Please contact the clinic.');
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (!current.exists) throw publicError('not-found', 'We could not find this booking.');
    const currentAppointment = current.data();
    if (!canPatientCancel({ appointment: currentAppointment, uid: null, cutoffHours: config.patientCancellationCutoffHours, allowGuest: true })) throw publicError('failed-precondition', 'This appointment can no longer be cancelled online. Please contact the clinic.');
    const now = FieldValue.serverTimestamp();
    transaction.update(ref, { status: 'cancelled', cancellation: { byUid: null, byRole: 'guest', reason, at: now }, updatedAt: now });
    releaseUnitsInTransaction({ db, transaction, slotIds: appointmentUnitIds(currentAppointment) });
    transaction.set(ref.collection('events').doc(), { from: currentAppointment.status, to: 'cancelled', byUid: null, byRole: 'guest', reason, at: now });
    transaction.set(db.collection('auditLogs').doc(), { at: now, actor: { uid: null, role: 'guest' }, action: 'appointment_cancelled', resource: { type: 'appointment', id: ref.id }, meta: { source: 'guest_manage' } });
  });
  await deleteAppointmentFromGoogle({ ref, appointment });
  return { ok: true, status: 'cancelled' };
});

exports.rescheduleBookingByToken = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB', secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_KEY] }, async (request) => {
  await enforceBookingRateLimit(request);
  const { ref, appointment } = await findGuestAppointment(request.data?.reference, request.data?.token);
  const dateKey = trimmed(request.data?.dateKey, 10);
  const time = trimmed(request.data?.time, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw publicError('invalid-argument', 'Choose a valid new appointment time.');
  const config = bookingConfig(await db.collection('clinic').doc('publicConfig').get());
  if (!canPatientCancel({ appointment, uid: null, cutoffHours: config.patientCancellationCutoffHours, allowGuest: true })) throw publicError('failed-precondition', 'This appointment can no longer be changed online. Please contact the clinic.');
  const now = new Date();
  const context = await availabilityContext({ doctorId: appointment.doctorId, dateKey, visitTypeId: appointment.visitType, now });
  const requested = daySlotsFor({ doctorId: appointment.doctorId, context, dateKey, now }).find((slot) => slot.time === time);
  if (!requested) throw publicError('failed-precondition', 'That time is no longer available. Please choose another slot.');
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (!current.exists) throw publicError('not-found', 'We could not find this booking.');
    const currentAppointment = current.data();
    if (!canPatientCancel({ appointment: currentAppointment, uid: null, cutoffHours: config.patientCancellationCutoffHours, allowGuest: true })) throw publicError('failed-precondition', 'This appointment can no longer be changed online. Please contact the clinic.');
    if (currentAppointment.dateKey === dateKey && istTimeOf(currentAppointment.startsAt) === time) throw publicError('failed-precondition', 'Choose a different appointment time.');
    const lostUnitIds = appointmentUnitIds(currentAppointment);
    const stamp = FieldValue.serverTimestamp();
    const unitIds = await placeAppointmentInTransaction({
      db,
      transaction,
      doctorId: currentAppointment.doctorId,
      startsAt: requested.startsAt,
      endsAt: requested.endsAt,
      bufferBefore: context.visitType.bufferBeforeMinutes,
      bufferAfter: context.visitType.bufferAfterMinutes,
      appointmentRef: ref,
      visitTypeId: context.visitType.id,
      claimAppointmentId: ref.id,
      now,
    });
    releaseUnitsInTransaction({ db, transaction, slotIds: lostUnitIds.filter((unitId) => !unitIds.includes(unitId)) });
    transaction.update(ref, { dateKey, startsAt: Timestamp.fromDate(requested.startsAt), endsAt: Timestamp.fromDate(requested.endsAt), slotIds: unitIds, updatedAt: stamp });
    transaction.set(ref.collection('events').doc(), { from: currentAppointment.status, to: currentAppointment.status, byUid: null, byRole: 'guest', at: stamp, meta: { action: 'rescheduled', fromDateKey: currentAppointment.dateKey, toDateKey: dateKey, toTime: time } });
    transaction.set(db.collection('auditLogs').doc(), { at: stamp, actor: { uid: null, role: 'guest' }, action: 'appointment_rescheduled', resource: { type: 'appointment', id: ref.id }, meta: { source: 'guest_manage', fromDateKey: currentAppointment.dateKey, toDateKey: dateKey } });
  });
  return { ok: true, reference: appointment.reference, appointmentId: ref.id, dateKey, time, status: appointment.status };
});

const requireCalendarStaff = (request, doctorId) => {
  assertPasswordChanged(request);
  const role = ROLE[request.auth?.token?.role];
  if (!role) throw publicError('permission-denied', 'Staff access is required.');
  if (role === 'doctor' && request.auth.token.doctorId !== doctorId) throw publicError('permission-denied', 'You can only manage your own calendar.');
  return role;
};

exports.saveCalendarBlock = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const doctorId = trimmed(request.data?.doctorId, 120);
  const dateKey = trimmed(request.data?.dateKey, 10);
  const start = trimmed(request.data?.start, 5);
  const end = trimmed(request.data?.end, 5);
  const reason = trimmed(request.data?.reason, 200);
  const role = requireCalendarStaff(request, doctorId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || !reason) throw publicError('invalid-argument', 'Enter a date, time range, and reason for the block.');
  const startsAt = istInstant(dateKey, start);
  const endsAt = istInstant(dateKey, end);
  if (endsAt <= startsAt) throw publicError('invalid-argument', 'The block must end after it starts.');
  const ref = db.collection('calendarBlocks').doc();
  await ref.set({ doctorId, dateKey, startsAt: Timestamp.fromDate(startsAt), endsAt: Timestamp.fromDate(endsAt), reason, createdBy: { uid: request.auth.uid, role }, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await db.collection('auditLogs').add({ at: FieldValue.serverTimestamp(), actor: { uid: request.auth.uid, role }, action: 'calendar_block_created', resource: { type: 'calendar_block', id: ref.id }, meta: { doctorId, dateKey } });
  return { id: ref.id, dateKey, start, end };
});

exports.deleteCalendarBlock = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const blockId = trimmed(request.data?.blockId, 200);
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(blockId)) throw publicError('invalid-argument', 'Choose a valid calendar block.');
  const ref = db.collection('calendarBlocks').doc(blockId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw publicError('not-found', 'Calendar block not found.');
  const role = requireCalendarStaff(request, snapshot.get('doctorId'));
  await ref.delete();
  await db.collection('auditLogs').add({ at: FieldValue.serverTimestamp(), actor: { uid: request.auth.uid, role }, action: 'calendar_block_deleted', resource: { type: 'calendar_block', id: blockId }, meta: { doctorId: snapshot.get('doctorId'), dateKey: snapshot.get('dateKey') } });
  return { ok: true };
});

exports.createStaffAppointment = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB', secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_KEY] }, async (request) => {
  assertPasswordChanged(request);
  const role = ROLE[request.auth?.token?.role];
  if (!role) throw publicError('permission-denied', 'Staff access is required.');
  const doctorId = trimmed(request.data?.doctorId, 120);
  const patientId = trimmed(request.data?.patientId, 200);
  const dateKey = trimmed(request.data?.dateKey, 10);
  const time = trimmed(request.data?.time, 5);
  const visitTypeId = trimmed(request.data?.visitTypeId, 120) || 'consultation';
  const source = ['manager', 'walk_in', 'phone'].includes(request.data?.source) ? request.data.source : 'manager';
  if (!doctorId || !patientId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw publicError('invalid-argument', 'Choose a patient, doctor, date, and time.');
  if (role === 'doctor' && request.auth.token.doctorId !== doctorId) throw publicError('permission-denied', 'You can only book your own calendar.');
  const patientSnapshot = await db.collection('patients').doc(patientId).get();
  const doctorSnapshot = await db.collection('doctors').doc(doctorId).get();
  if (!patientSnapshot.exists || !doctorSnapshot.exists || doctorSnapshot.get('active') !== true) throw publicError('not-found', 'Patient or doctor not found.');
  const now = new Date();
  const context = await availabilityContext({ doctorId, dateKey, visitTypeId, now });
  const requested = daySlotsFor({ doctorId, context, dateKey, now, ignoreNotice: true }).find((slot) => slot.time === time);
  if (!requested) throw publicError('failed-precondition', 'That time is no longer available.');
  const appointmentRef = db.collection('appointments').doc();
  const queueRef = db.collection('counters').doc(`queue_${doctorId}_${dateKey}`);
  const reference = newReference();
  const patient = patientSnapshot.data();
  const createdBy = { uid: request.auth.uid, role };
  const status = context.visitType.requiresConfirmation ? 'scheduled' : 'confirmed';
  await db.runTransaction(async (transaction) => {
    // Every read comes before the first write, then the unit locks are placed.
    const queue = await transaction.get(queueRef);
    const unitIds = await placeAppointmentInTransaction({
      db,
      transaction,
      doctorId,
      startsAt: requested.startsAt,
      endsAt: requested.endsAt,
      bufferBefore: context.visitType.bufferBeforeMinutes,
      bufferAfter: context.visitType.bufferAfterMinutes,
      appointmentRef,
      visitTypeId: context.visitType.id,
      now,
    });
    const queueToken = (Number(queue.get('value')) || 0) + 1;
    transaction.set(queueRef, { value: queueToken, doctorId, dateKey, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    transaction.set(appointmentRef, {
      reference, branchId: doctorSnapshot.get('branchId'), departmentId: doctorSnapshot.get('departmentIds')?.[0] || null,
      doctorId, visitType: context.visitType.id, visitMode: context.visitType.mode, dateKey,
      startsAt: Timestamp.fromDate(requested.startsAt), endsAt: Timestamp.fromDate(requested.endsAt),
      status, source, patientId, patientSnapshot: { name: patient.name || '', phone: patient.phone || '' }, phoneKey: patient.phone || null,
      reason: trimmed(request.data?.reason, 500) || null, queueToken, slotIds: unitIds, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(appointmentPrivateRef(appointmentRef.id), { appointmentId: appointmentRef.id, createdByUid: createdBy.uid, createdAt: FieldValue.serverTimestamp() });
    transaction.create(db.collection('bookingReferences').doc(reference), { appointmentId: appointmentRef.id, createdAt: FieldValue.serverTimestamp() });
    transaction.set(appointmentRef.collection('events').doc(), { from: null, to: status, byUid: request.auth.uid, byRole: role, at: FieldValue.serverTimestamp(), meta: { source } });
    transaction.set(db.collection('auditLogs').doc(), { at: FieldValue.serverTimestamp(), actor: createdBy, action: 'appointment_created', resource: { type: 'appointment', id: appointmentRef.id }, patientId, meta: { source, status } });
  });
  const created = await appointmentRef.get();
  await syncAppointmentToGoogle(appointmentRef.id);
  return { appointmentId: appointmentRef.id, reference: created.get('reference'), status };
});

exports.joinWaitlist = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const doctorId = trimmed(request.data?.doctorId, 120);
  const visitTypeId = trimmed(request.data?.visitTypeId, 120) || 'consultation';
  const dateKey = trimmed(request.data?.dateKey, 10);
  const name = trimmed(request.data?.name, 120);
  const phone = trimmed(request.data?.phone, 30);
  const email = trimmed(request.data?.email, 240);
  if (!doctorId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !name || !validPhone(phone)) throw publicError('invalid-argument', 'Enter your name, phone number, doctor, and preferred date.');
  const phoneKey = toE164(phone);
  if (!phoneKey) throw publicError('invalid-argument', 'Enter a valid Indian mobile number.');
  await enforceBookingRateLimit(request);
  const existing = await db.collection('waitlist')
    .where('doctorId', '==', doctorId)
    .where('phoneKey', '==', phoneKey)
    .where('dateKey', '==', dateKey)
    .where('status', '==', 'active')
    .limit(1)
    .get();
  if (existing.size) return { waitlistId: existing.docs[0].id, alreadyJoined: true };
  const ref = db.collection('waitlist').doc();
  await ref.set({
    doctorId, visitTypeId, dateKey, name, phoneKey, email: email || null,
    status: 'active', source: request.auth ? 'patient_portal' : 'web',
    createdBy: request.auth ? request.auth.uid : null,
    createdAt: FieldValue.serverTimestamp(),
  });
  await db.collection('auditLogs').add({
    at: FieldValue.serverTimestamp(),
    actor: request.auth ? { uid: request.auth.uid, role: roleFor(request.auth) } : { uid: null, role: 'public' },
    action: 'waitlist_joined',
    resource: { type: 'waitlist', id: ref.id },
    meta: { doctorId, dateKey, visitTypeId },
  });
  return { waitlistId: ref.id, alreadyJoined: false };
});

exports.moveAppointment = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  assertPasswordChanged(request);
  const role = ROLE[request.auth?.token?.role];
  const appointmentId = trimmed(request.data?.appointmentId, 200);
  const dateKey = trimmed(request.data?.dateKey, 10);
  const time = trimmed(request.data?.time, 5);
  if (!role || !/^[A-Za-z0-9_-]{1,200}$/.test(appointmentId) || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw publicError('invalid-argument', 'Choose a valid appointment and time.');
  const ref = db.collection('appointments').doc(appointmentId);
  const initial = await ref.get();
  if (!initial.exists) throw publicError('not-found', 'Appointment not found.');
  const initialAppointment = initial.data();
  if (role === 'doctor' && initialAppointment.doctorId !== request.auth.token.doctorId) throw publicError('permission-denied', 'You can only move your own appointments.');
  if (!isActiveAppointment(initialAppointment.status)) throw publicError('failed-precondition', 'Closed appointments cannot be moved.');
  const now = new Date();
  const context = await availabilityContext({ doctorId: initialAppointment.doctorId, dateKey, visitTypeId: initialAppointment.visitType, now });
  const requested = daySlotsFor({ doctorId: initialAppointment.doctorId, context, dateKey, now, ignoreNotice: true }).find((slot) => slot.time === time);
  if (!requested) throw publicError('failed-precondition', 'That time conflicts with another booking or is outside hours.');
  await db.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (!current.exists) throw publicError('not-found', 'Appointment not found.');
    const appointment = current.data();
    const lostUnitIds = appointmentUnitIds(appointment);
    const stamp = FieldValue.serverTimestamp();
    const unitIds = await placeAppointmentInTransaction({
      db,
      transaction,
      doctorId: appointment.doctorId,
      startsAt: requested.startsAt,
      endsAt: requested.endsAt,
      bufferBefore: context.visitType.bufferBeforeMinutes,
      bufferAfter: context.visitType.bufferAfterMinutes,
      appointmentRef: ref,
      visitTypeId: context.visitType.id,
      claimAppointmentId: ref.id,
      now,
    });
    releaseUnitsInTransaction({ db, transaction, slotIds: lostUnitIds.filter((unitId) => !unitIds.includes(unitId)) });
    transaction.update(ref, { dateKey, startsAt: Timestamp.fromDate(requested.startsAt), endsAt: Timestamp.fromDate(requested.endsAt), slotIds: unitIds, updatedAt: stamp });
    transaction.set(ref.collection('events').doc(), { from: appointment.status, to: appointment.status, byUid: request.auth.uid, byRole: role, at: stamp, meta: { action: 'moved', fromDateKey: appointment.dateKey, toDateKey: dateKey, toTime: time } });
    transaction.set(db.collection('auditLogs').doc(), { at: stamp, actor: { uid: request.auth.uid, role }, action: 'appointment_moved', resource: { type: 'appointment', id: ref.id }, meta: { fromDateKey: appointment.dateKey, toDateKey: dateKey } });
  });
  return { ok: true, appointmentId, dateKey, time };
});

exports.addStaffNote = onCall({ ...callableOptions, timeoutSeconds: 20, memory: '256MiB' }, async (request) => {
  assertPasswordChanged(request);
  const role = ROLE[request.auth?.token?.role];
  const appointmentId = trimmed(request.data?.appointmentId, 200);
  const note = trimmed(request.data?.note, 2000);
  if (!role || !/^[A-Za-z0-9_-]{1,200}$/.test(appointmentId) || !note) throw publicError('invalid-argument', 'Enter a note.');
  const appointment = await db.collection('appointments').doc(appointmentId).get();
  if (!appointment.exists) throw publicError('not-found', 'Appointment not found.');
  if (role === 'doctor' && appointment.get('doctorId') !== request.auth.token.doctorId) throw publicError('permission-denied', 'You can only add notes to your own appointments.');
  const ref = appointment.ref.collection('staffNotes').doc();
  await ref.set({ note, createdBy: { uid: request.auth.uid, role }, createdAt: FieldValue.serverTimestamp() });
  await db.collection('auditLogs').add({ at: FieldValue.serverTimestamp(), actor: { uid: request.auth.uid, role }, action: 'staff_note_added', resource: { type: 'appointment', id: appointmentId }, meta: {} });
  return { noteId: ref.id };
});

const requireVideoStaff = (request) => {
  assertPasswordChanged(request);
  const role = ROLE[request.auth?.token?.role];
  if (!request.auth || !role) throw publicError('permission-denied', 'Staff access is required.');
  return role;
};
const safeVideoUrl = (value) => {
  const url = trimmed(value, 2000);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password) throw new Error('unsafe');
    return parsed.toString();
  } catch (_error) {
    throw publicError('invalid-argument', 'Use a valid secure https video meeting link.');
  }
};

// Meeting links remain clinic-controlled. The application does not create rooms,
// transmit appointment data to a video vendor, or enrol the clinic in a paid
// service; an authorised staff member supplies a secure link only when ready.
exports.getVideoConsultationQueue = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const role = requireVideoStaff(request);
  const now = new Date();
  const from = Timestamp.fromDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const to = Timestamp.fromDate(new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000));
  let query = db.collection('appointments').where('visitMode', '==', 'video').where('startsAt', '>=', from).where('startsAt', '<=', to);
  if (role === 'doctor') query = query.where('doctorId', '==', request.auth.token.doctorId);
  const snapshot = await query.orderBy('startsAt', 'asc').limit(50).get();
  return {
    appointments: snapshot.docs
      .map((item) => ({ id: item.id, reference: item.get('reference'), doctorId: item.get('doctorId'), startsAt: asDate(item.get('startsAt'))?.toISOString() || null, status: item.get('status'), patient: item.get('patientSnapshot') || {}, videoConsultation: item.get('videoConsultation') || { status: 'awaiting_link' } }))
      .filter((item) => isActiveAppointment(item.status)),
  };
});

exports.setVideoConsultationAccess = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const role = requireVideoStaff(request);
  const appointmentId = trimmed(request.data?.appointmentId, 200);
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(appointmentId)) throw publicError('invalid-argument', 'Choose a valid online appointment.');
  const joinUrl = safeVideoUrl(request.data?.joinUrl);
  const ref = db.collection('appointments').doc(appointmentId);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.get('visitMode') !== 'video') throw publicError('not-found', 'Online appointment not found.');
  const appointment = snapshot.data();
  if (role === 'doctor' && appointment.doctorId !== request.auth.token.doctorId) throw publicError('permission-denied', 'You can only prepare access for your own appointments.');
  if (!isActiveAppointment(appointment.status)) throw publicError('failed-precondition', 'Video access cannot be changed after the appointment is closed.');
  const videoConsultation = joinUrl
    ? { status: 'ready', joinUrl, preparedBy: request.auth.uid, preparedAt: FieldValue.serverTimestamp() }
    : { status: 'awaiting_link', clearedBy: request.auth.uid, clearedAt: FieldValue.serverTimestamp() };
  await ref.set({ videoConsultation, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await db.collection('auditLogs').add({ at: FieldValue.serverTimestamp(), actor: { uid: request.auth.uid, role }, action: joinUrl ? 'video_access_prepared' : 'video_access_cleared', resource: { type: 'appointment', id: appointmentId }, meta: { visitMode: 'video' } });
  return { message: joinUrl ? 'Secure video access is ready for the patient.' : 'Video access was cleared.' };
});

// All appointment lifecycle changes happen on the trusted server. Browser clients
// may read appointments, but Firestore rules intentionally deny direct writes.
exports.transitionAppointment = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB', secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_KEY] }, async (request) => {
  assertPasswordChanged(request);
  const role = ROLE[request.auth?.token?.role];
  if (!role) throw publicError('permission-denied', 'Staff access is required.');
  const { appointmentId, to, reason } = request.data || {};
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(String(appointmentId || '')) || !/^[a-z_]{2,40}$/.test(String(to || ''))) throw publicError('invalid-argument', 'Invalid appointment update.');
  const cancellationReason = trimmed(reason, 300);
  if (to === 'cancelled' && !cancellationReason) throw publicError('invalid-argument', 'A cancellation reason is required.');
  const ref = db.collection('appointments').doc(appointmentId);
  let cancelledAppointment;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw publicError('not-found', 'Appointment not found.');
    const appointment = snapshot.data();
    if (role === 'doctor' && appointment.doctorId !== request.auth.token.doctorId) throw publicError('permission-denied', 'You can only update your own appointments.');
    if (!canTransition(appointment.status, to, role)) throw publicError('failed-precondition', 'That appointment change is not allowed.');
    const now = FieldValue.serverTimestamp();
    const update = { status: to, updatedAt: now };
    if (to === 'cancelled') update.cancellation = { byUid: request.auth.uid, byRole: role, reason: cancellationReason, at: now };
    transaction.update(ref, update);
    if (to === 'cancelled') {
      releaseUnitsInTransaction({ db, transaction, slotIds: appointmentUnitIds(appointment) });
      cancelledAppointment = { ref, appointment };
    }
    transaction.set(ref.collection('events').doc(), { from: appointment.status, to, byUid: request.auth.uid, byRole: role, at: now, reason: to === 'cancelled' ? cancellationReason : null });
    transaction.set(db.collection('auditLogs').doc(), { at: now, actor: { uid: request.auth.uid, role }, action: `appointment_${to}`, resource: { type: 'appointment', id: ref.id } });
  });
  if (cancelledAppointment) await deleteAppointmentFromGoogle(cancelledAppointment);
  return { ok: true, status: to };
});

// Patients can release their own future slot before the configured cutoff. The
// appointment, slot release, event, and audit record are one transaction.
exports.cancelPatientAppointment = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB', secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_KEY] }, async (request) => {
  if (!request.auth || isStaffRole(request.auth.token.role)) throw publicError('permission-denied', 'Sign in to cancel your appointment.');
  const appointmentId = trimmed(request.data?.appointmentId, 200);
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(appointmentId)) throw publicError('invalid-argument', 'Invalid appointment.');
  const reason = trimmed(request.data?.reason, 300) || 'Cancelled by patient';
  const config = bookingConfig(await db.collection('clinic').doc('publicConfig').get());
  const ref = db.collection('appointments').doc(appointmentId);
  let cancelledAppointment;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw publicError('not-found', 'Appointment not found.');
    const appointment = snapshot.data();
    if (!canPatientCancel({ appointment, uid: request.auth.uid, cutoffHours: config.patientCancellationCutoffHours })) throw publicError('failed-precondition', 'This appointment can no longer be cancelled online. Please contact the clinic.');
    const now = FieldValue.serverTimestamp();
    transaction.update(ref, { status: 'cancelled', cancellation: { byUid: request.auth.uid, byRole: 'patient', reason, at: now }, updatedAt: now });
    releaseUnitsInTransaction({ db, transaction, slotIds: appointmentUnitIds(appointment) });
    cancelledAppointment = { ref, appointment };
    transaction.set(ref.collection('events').doc(), { from: appointment.status, to: 'cancelled', byUid: request.auth.uid, byRole: 'patient', reason, at: now });
    transaction.set(db.collection('auditLogs').doc(), { at: now, actor: { uid: request.auth.uid, role: 'patient' }, action: 'appointment_cancelled', resource: { type: 'appointment', id: ref.id }, meta: { source: 'patient_portal' } });
  });
  if (cancelledAppointment) await deleteAppointmentFromGoogle(cancelledAppointment);
  return { ok: true, status: 'cancelled' };
});

// Patients may move an eligible future appointment, but all availability and
// slot ownership decisions remain on the trusted server.
exports.reschedulePatientAppointment = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB', secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_KEY] }, async (request) => {
  if (!request.auth || isStaffRole(request.auth.token.role)) throw publicError('permission-denied', 'Sign in to reschedule your appointment.');
  const appointmentId = trimmed(request.data?.appointmentId, 200);
  const dateKey = trimmed(request.data?.dateKey, 10);
  const time = trimmed(request.data?.time, 5);
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(appointmentId) || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw publicError('invalid-argument', 'Choose a valid new appointment time.');

  const config = bookingConfig(await db.collection('clinic').doc('publicConfig').get());
  const ref = db.collection('appointments').doc(appointmentId);
  const initial = await ref.get();
  if (!initial.exists) throw publicError('not-found', 'Appointment not found.');
  const initialAppointment = initial.data();
  if (!canPatientCancel({ appointment: initialAppointment, uid: request.auth.uid, cutoffHours: config.patientCancellationCutoffHours })) throw publicError('failed-precondition', 'This appointment can no longer be changed online. Please contact the clinic.');
  const now = new Date();
  const context = await availabilityContext({ doctorId: initialAppointment.doctorId, dateKey, visitTypeId: initialAppointment.visitType, now });
  const requested = daySlotsFor({ doctorId: initialAppointment.doctorId, context, dateKey, now }).find((slot) => slot.time === time);
  if (!requested) throw publicError('failed-precondition', 'That time is no longer available. Please choose another slot.');
  let result;
  let calendarIds = { calendarId: null, eventId: null };
  await db.runTransaction(async (transaction) => {
    const [snapshot, internals] = await Promise.all([transaction.get(ref), transaction.get(appointmentPrivateRef(ref.id))]);
    if (!snapshot.exists) throw publicError('not-found', 'Appointment not found.');
    const appointment = snapshot.data();
    if (!canPatientCancel({ appointment, uid: request.auth.uid, cutoffHours: config.patientCancellationCutoffHours })) throw publicError('failed-precondition', 'This appointment can no longer be changed online. Please contact the clinic.');
    if (appointment.dateKey === dateKey && istTimeOf(appointment.startsAt) === time) throw publicError('failed-precondition', 'Choose a different appointment time.');
    calendarIds = calendarIdsFrom(internals.exists ? internals.data() : null, appointment);
    const lostUnitIds = appointmentUnitIds(appointment);
    const stamp = FieldValue.serverTimestamp();
    const unitIds = await placeAppointmentInTransaction({
      db,
      transaction,
      doctorId: appointment.doctorId,
      startsAt: requested.startsAt,
      endsAt: requested.endsAt,
      bufferBefore: context.visitType.bufferBeforeMinutes,
      bufferAfter: context.visitType.bufferAfterMinutes,
      appointmentRef: ref,
      visitTypeId: context.visitType.id,
      claimAppointmentId: ref.id,
      now,
    });
    releaseUnitsInTransaction({ db, transaction, slotIds: lostUnitIds.filter((unitId) => !unitIds.includes(unitId)) });
    // An appointment created before the move keeps its Google event reachable by copying
    // its identifiers into appointmentPrivate once; the appointment itself keeps only the
    // sync status, which replaces the whole map and therefore drops the old identifiers.
    if (calendarIds.eventId) transaction.set(appointmentPrivateRef(ref.id), calendarIds, { merge: true });
    transaction.update(ref, { dateKey, startsAt: Timestamp.fromDate(requested.startsAt), endsAt: Timestamp.fromDate(requested.endsAt), slotIds: unitIds, updatedAt: stamp, externalCalendar: publicSyncState({ syncStatus: calendarIds.eventId ? 'pending' : 'not_connected' }) });
    transaction.set(ref.collection('events').doc(), { from: appointment.status, to: appointment.status, byUid: request.auth.uid, byRole: 'patient', at: stamp, meta: { action: 'rescheduled', fromDateKey: appointment.dateKey, toDateKey: dateKey, toTime: time } });
    transaction.set(db.collection('auditLogs').doc(), { at: stamp, actor: { uid: request.auth.uid, role: 'patient' }, action: 'appointment_rescheduled', resource: { type: 'appointment', id: ref.id }, meta: { fromDateKey: appointment.dateKey, toDateKey: dateKey } });
    result = { appointmentId: ref.id, dateKey, time, status: appointment.status };
  });

  // Calendar synchronization is a mirror of the clinic's appointment record;
  // a transient Google failure never rolls back a successfully reserved slot.
  try {
    const appointment = (await ref.get()).data();
    if (calendarIds.eventId) {
      const connection = await calendarConnection(appointment.doctorId);
      if (connection) {
        const { accessToken, calendarId } = await calendarAccess(connection);
        await updateEventTime({ accessToken, calendarId: calendarIds.calendarId || calendarId, eventId: calendarIds.eventId, startsAt: asDate(appointment.startsAt).toISOString(), endsAt: asDate(appointment.endsAt).toISOString() });
        await ref.set({ externalCalendar: { ...publicSyncState({ syncStatus: 'synced' }), lastSyncedAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
  } catch (_error) {
    await ref.set({ externalCalendar: publicSyncState({ syncStatus: 'pending', lastSyncError: 'Calendar event could not be updated.' }), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  return { ok: true, ...result };
});

// Closing a day must be deliberate: staff first preview affected appointments,
// then explicitly keep them or cancel every appointment they are permitted to cancel.
exports.closeDay = onCall({ ...callableOptions, timeoutSeconds: 60, memory: '256MiB', secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_KEY] }, async (request) => {
  assertPasswordChanged(request);
  const role = ROLE[request.auth?.token?.role];
  const { doctorId, dateKey, mode = 'preview', action = 'keep', reason } = request.data || {};
  if (!role || !['admin', 'doctor'].includes(role)) throw publicError('permission-denied', 'Administrator or doctor access is required.');
  if (!isDoctorId(doctorId) || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || '')) || !['preview', 'apply'].includes(mode) || !['keep', 'cancel'].includes(action)) throw publicError('invalid-argument', 'Choose a valid clinic day action.');
  if (role === 'doctor' && request.auth.token.doctorId !== doctorId) throw publicError('permission-denied', 'You can only close your own clinic day.');
  const closeReason = trimmed(reason, 300);
  if (mode === 'apply' && action === 'cancel' && !closeReason) throw publicError('invalid-argument', 'A cancellation reason is required.');
  const appointments = (await db.collection('appointments').where('doctorId', '==', doctorId).where('dateKey', '==', dateKey).get()).docs
    .map((snapshot) => ({ ref: snapshot.ref, id: snapshot.id, ...snapshot.data() }))
    .filter((appointment) => isActiveAppointment(appointment.status));
  const summary = appointments.map((appointment) => ({ id: appointment.id, reference: appointment.reference || null, status: appointment.status, startsAt: asDate(appointment.startsAt)?.toISOString() || null, canCancel: canTransition(appointment.status, 'cancelled', role) }));
  if (mode === 'preview') return { doctorId, dateKey, appointments: summary };
  if (appointments.length > 100) throw publicError('failed-precondition', 'This day has too many appointments to close at once. Please contact clinic support.');
  if (action === 'cancel' && appointments.some((appointment) => !canTransition(appointment.status, 'cancelled', role))) throw publicError('failed-precondition', 'Some appointments cannot be cancelled by your role. Keep them or ask an administrator to close the day.');
  const exceptionRef = db.collection('scheduleExceptions').doc(`${doctorId}_${dateKey}`);
  const cancelledAppointments = [];
  await db.runTransaction(async (transaction) => {
    const currentAppointments = await Promise.all(appointments.map((appointment) => transaction.get(appointment.ref)));
    await transaction.get(exceptionRef);
    const now = FieldValue.serverTimestamp();
    transaction.set(exceptionRef, { doctorId, dateKey, type: 'closed', sessions: [], note: 'Clinic closed', updatedAt: now, updatedBy: request.auth.uid }, { merge: true });
    currentAppointments.forEach((snapshot) => {
      if (!snapshot.exists) return;
      const appointment = snapshot.data();
      if (!isActiveAppointment(appointment.status)) return;
      if (action === 'cancel') {
        if (!canTransition(appointment.status, 'cancelled', role)) throw publicError('failed-precondition', 'An appointment changed and cannot be cancelled by your role. Review the day again.');
        transaction.update(snapshot.ref, { status: 'cancelled', cancellation: { byUid: request.auth.uid, byRole: role, reason: closeReason, at: now }, updatedAt: now });
        releaseUnitsInTransaction({ db, transaction, slotIds: appointmentUnitIds(appointment) });
        cancelledAppointments.push({ ref: snapshot.ref, appointment });
        transaction.set(snapshot.ref.collection('events').doc(), { from: appointment.status, to: 'cancelled', byUid: request.auth.uid, byRole: role, reason: closeReason, at: now, meta: { source: 'close_day', dateKey } });
      }
    });
    transaction.set(db.collection('auditLogs').doc(), { at: now, actor: { uid: request.auth.uid, role }, action: 'clinic_day_closed', resource: { type: 'schedule_exception', id: exceptionRef.id }, meta: { doctorId, dateKey, action, affectedAppointments: appointments.length } });
  });
  await Promise.all(cancelledAppointments.map((item) => deleteAppointmentFromGoogle(item)));
  if (action === 'cancel') {
    await Promise.all(cancelledAppointments
      .filter(({ appointment }) => appointment.patientSnapshot?.email)
      .map(({ appointment, ref }) => db.collection('notifications').doc(`${ref.id}_clinic_cancelled_${dateKey}`).create({
        type: 'appointment_clinic_cancelled',
        channel: 'email',
        to: appointment.patientSnapshot.email,
        appointmentId: ref.id,
        status: 'queued',
        attempts: 0,
        sendAfter: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      }).catch((error) => {
        if (error.code !== 6) throw error;
      })));
  }
  return { ok: true, doctorId, dateKey, action, affectedAppointments: appointments.length };
});

// --- Google Calendar connection -------------------------------------------
// This is clinic-admin initiated only. Browser code receives an OAuth URL but
// never receives a client secret, refresh token, or another calendar's events.
exports.beginGoogleCalendarConnection = onCall({ ...callableOptions, secrets: [GOOGLE_CALENDAR_CLIENT_ID] }, async (request) => {
  requireAdmin(request);
  const { doctorId, calendarId = 'primary' } = request.data || {};
  if (!doctorId || !/^[A-Za-z0-9_-]{1,120}$/.test(String(doctorId)) || !/^[A-Za-z0-9@._-]{1,240}$/.test(String(calendarId))) throw publicError('invalid-argument', 'Choose a valid doctor and Google Calendar.');
  const state = crypto.randomBytes(32).toString('base64url');
  await db.collection('integrationOAuthStates').doc(state).set({ doctorId, calendarId, requestedBy: request.auth.uid, expiresAt: Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)), createdAt: FieldValue.serverTimestamp() });
  return { authorizationUrl: buildAuthorizationUrl({ clientId: GOOGLE_CALENDAR_CLIENT_ID.value(), redirectUri: googleCallbackUrl(), state }) };
});

// Google redirects a browser here after consent, so this endpoint must be publicly
// invokable. The one-time, expiring state value protects the callback itself.
exports.googleCalendarCallback = onRequest({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB', invoker: 'public', secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_KEY] }, async (req, res) => {
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  if (!code || !state) return res.status(400).send('Google Calendar connection could not be verified.');
  const stateRef = db.collection('integrationOAuthStates').doc(state);
  const stateSnapshot = await stateRef.get();
  const expiresAt = stateSnapshot.exists ? asDate(stateSnapshot.get('expiresAt')) : null;
  if (!stateSnapshot.exists || !expiresAt || expiresAt.getTime() < Date.now()) return res.status(400).send('This Google Calendar connection request has expired. Return to the staff portal and try again.');
  try {
    const token = await exchangeAuthorizationCode({ code, clientId: GOOGLE_CALENDAR_CLIENT_ID.value(), clientSecret: GOOGLE_CALENDAR_CLIENT_SECRET.value(), redirectUri: googleCallbackUrl() });
    if (!token.refresh_token) throw new Error('No refresh token received.');
    await db.collection('integrations').doc('googleCalendar').set({ provider: 'google', doctorId: stateSnapshot.get('doctorId'), calendarId: stateSnapshot.get('calendarId'), active: true, encryptedRefreshToken: encrypt(token.refresh_token, GOOGLE_CALENDAR_TOKEN_KEY.value()), connectedBy: stateSnapshot.get('requestedBy'), connectedAt: FieldValue.serverTimestamp(), syncStatus: 'healthy', lastSyncError: FieldValue.delete() }, { merge: true });
    await stateRef.delete();
    return res.status(200).type('html').send('<!doctype html><title>Calendar connected</title><p>Google Calendar is connected. You may close this window and return to the staff portal.</p>');
  } catch (_error) {
    return res.status(400).type('html').send('<!doctype html><title>Calendar connection failed</title><p>The Google Calendar connection could not be completed. Please return to the staff portal and try again.</p>');
  }
});

exports.googleCalendarStatus = onCall({ ...callableOptions }, async (request) => {
  requireAdmin(request);
  const snapshot = await db.collection('integrations').doc('googleCalendar').get();
  if (!snapshot.exists) return { connected: false };
  const value = snapshot.data();
  return { connected: value.active === true, doctorId: value.doctorId, calendarId: value.calendarId, syncStatus: value.syncStatus || 'unknown', lastSyncError: value.lastSyncError || null };
});

exports.disconnectGoogleCalendar = onCall({ ...callableOptions }, async (request) => {
  requireAdmin(request);
  await db.collection('integrations').doc('googleCalendar').set({ active: false, disconnectedAt: FieldValue.serverTimestamp(), disconnectedBy: request.auth.uid, syncStatus: 'disconnected' }, { merge: true });
  return { disconnected: true };
});
