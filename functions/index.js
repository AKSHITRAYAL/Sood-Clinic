const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const crypto = require('crypto');
const { istDateKey, istInstant, toIstParts, weekdayIst } = require('./lib/ist');
const { buildAvailability, makeSlotId } = require('./lib/availability');
const { buildAuthorizationUrl, createEvent, deleteEvent, decrypt, encrypt, exchangeAuthorizationCode, freeBusy, refreshAccessToken, updateEventTime } = require('./lib/googleCalendar');
const { canMarkNoShow, canStaffReschedule, canTransition, NO_SHOW_GRACE_MINUTES } = require('./lib/stateMachine');
const { isDoctorId, isEmail, isStaffRole, normalizeEmail } = require('./lib/staffAccess');
const { canPatientCancel } = require('./lib/appointmentPolicy');
const { formatUhid, isUhid, normalizePatientName, normalizePhone } = require('./lib/patientRegistry');
const { toE164 } = require('./lib/phone');
const { requireLiveAdmin, createStaffDirectory, sqlStaffStore } = require('./lib/sqlStaffDirectory');
const { getDataConnect } = require('firebase-admin/data-connect');
const { createStaffLifecycle, sqlStaffLifecycleStore } = require('./lib/staffLifecycle');
const { requireLiveStaff, requireOAuthAdministrator } = require('./lib/staffAuthorization');
const { createClinicContact, sqlClinicContactStore } = require('./lib/clinicContact');
const { createSqlCatalogue, sqlCatalogueStore } = require('./lib/sqlCatalogue');
const { createSqlPatientBackend, sqlPatientCallableOptions } = require('./lib/sqlPatientBackend');
const { createSqlAuditLogBackend } = require('./lib/sqlAuditLog');
const { createSqlClinicDayBackend } = require('./lib/sqlClinicDay');
const { createSqlWeeklyHoursBackend } = require('./lib/sqlWeeklyHours');
const { createSqlSpecialHoursBackend } = require('./lib/sqlSpecialHours');
const { createBookingSettings, sqlBookingSettingsStore, selectVisitType } = require('./lib/bookingSettings');
// TEMPORARY TECHNICAL DEBT (2026-10-25): see lib/bookingFallback.js. SQL stays the
// authority; the Firestore read only covers an unusable SQL read until the reviewed
// SQL seed + connector release ships.
const { createBookingReads, firestoreCatalogue, firestoreConfig } = require('./lib/bookingFallback');
const { createSchedulerHoldHandler } = require('./lib/schedulerHoldsCallable');
const { createSqlSchedulerHolds } = require('./lib/sqlSchedulerHolds');
const { createSqlSchedulerAvailability, sqlSchedulerAvailabilityStore } = require('./lib/sqlSchedulerAvailability');
const { createSqlSchedulerClaims, sqlSchedulerClaimStore } = require('./lib/sqlSchedulerClaims');

admin.initializeApp();
setGlobalOptions({ region: 'asia-south1', maxInstances: 10 });

const db = admin.firestore();
const GOOGLE_CALENDAR_CLIENT_ID = defineSecret('GOOGLE_CALENDAR_CLIENT_ID');
const GOOGLE_CALENDAR_CLIENT_SECRET = defineSecret('GOOGLE_CALENDAR_CLIENT_SECRET');
const GOOGLE_CALENDAR_TOKEN_KEY = defineSecret('GOOGLE_CALENDAR_TOKEN_KEY');
const callableOptions = { region: 'asia-south1', enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' };
// The public/patient booking flow is reachable without a staff identity, and its
// services must be invocable (each handler still authorises the caller itself).
const bookingCallableOptions = { ...callableOptions, invoker: 'public' };
const requireAdmin = (request) => requireLiveAdmin(admin.auth(), request);
const requireRegistrationStaff = async (request) => {
  const user = await requireLiveStaff(admin.auth(), request, { roles: ['admin', 'manager'] });
  return user.customClaims.role;
};

const auditStaffAccess = async ({ actorUid, actorRole = 'admin', action, targetUid, resourceType = 'staff_account', meta = {} }) => db.collection('auditLogs').add({
  at: FieldValue.serverTimestamp(),
  actor: { uid: actorUid, role: actorRole },
  action,
  resource: { type: resourceType, id: targetUid },
  meta,
});


const isClinicTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ''));
const timeToMinutes = (value) => {
  const [hour, minute] = String(value).split(':').map(Number);
  return hour * 60 + minute;
};
const scheduleAuthority = async (request, doctorId) => {
  const user = await requireLiveStaff(admin.auth(), request, { roles: ['admin', 'doctor'], doctorId });
  return user.customClaims.role;
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
  const role = await scheduleAuthority(request, doctorId);
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
  const role = await scheduleAuthority(request, doctorId);
  const sessions = normaliseExceptionSessions(request.data?.sessions);
  const ref = db.collection('scheduleExceptions').doc(`${doctorId}_${dateKey}`);
  await ref.set({ doctorId, dateKey, type, sessions, updatedAt: FieldValue.serverTimestamp(), updatedBy: request.auth.uid, createdBy: request.auth.uid, createdAt: FieldValue.serverTimestamp() }, { merge: true });
  await db.collection('auditLogs').add({ at: FieldValue.serverTimestamp(), actor: { uid: request.auth.uid, role }, action: 'schedule_exception_saved', resource: { type: 'schedule_exception', id: ref.id }, meta: { doctorId, dateKey, type, sessionCount: sessions.length } });
  return { message: 'Special clinic hours saved.' };
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
  await requireAdmin(request);
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
  const actorRole = await requireRegistrationStaff(request);
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
  await requireAdmin(request);
  const uid = trimmed(request.data?.uid, 128);
  if (!uid) throw new HttpsError('invalid-argument', 'Select a patient first.');
  const snapshot = await db.collection('patients').doc(uid).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Patient record not found.');
  const data = snapshot.data();
  await db.collection('auditLogs').add({ at: FieldValue.serverTimestamp(), actor: { uid: request.auth.uid, role: 'admin' }, action: 'patient_profile_viewed', resource: { type: 'patient', id: uid } });
  return {
    uid,
    patientId: uid,
    uhid: data.uhid || '',
    linkedUids: Array.isArray(data.linkedUids) ? data.linkedUids : [uid],
    profile: Object.fromEntries([...PATIENT_PROFILE_FIELDS, 'email', 'createdAt', 'updatedAt'].map((field) => [field, data[field] || ''])),
  };
});

exports.updateAdminPatientProfile = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  await requireAdmin(request);
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
  const patientRef = db.collection('patients').doc(user.uid);
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
    transaction.set(db.collection('patientDirectory').doc(user.uid), patientDirectoryRecord({ patientId: user.uid, uid: user.uid, email: user.email, profile, uhid, linkedUids }), { merge: true });
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

// Staff registration deliberately creates a clinical record only. Linking it to
// a future patient login is a separate, verified workflow so a manager can
// never take over an existing Firebase account by entering an email address.
exports.registerPatient = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const actorRole = await requireRegistrationStaff(request);
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

const staffSql = () => getDataConnect({ serviceId: 'ak-sood-clinic-service', location: 'asia-south1', connector: 'clinic-admin' });
exports.getStaffSession = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB', maxInstances: 1 }, async (request) => {
  const user = await requireLiveStaff(admin.auth(), request, { allowForcedPassword: true });
  return { role: user.customClaims.role, doctorId: user.customClaims.role === 'doctor' ? user.customClaims.doctorId : null, mustChangePassword: user.customClaims.forcePasswordChange === true || request.auth.token.forcePasswordChange === true };
});
const staffLifecycleOptions = { ...callableOptions, timeoutSeconds: 60, memory: '256MiB', maxInstances: 1, concurrency: 1 };
const runStaffLifecycle = async (method, request) => {
  try {
    return await createStaffLifecycle({ auth: admin.auth(), store: sqlStaffLifecycleStore(staffSql()) })[method](request);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('unavailable', 'The staff change could not be confirmed. Refresh the directory before trying again.');
  }
};

exports.completeOwnPasswordChange = onCall(staffLifecycleOptions, (request) => runStaffLifecycle('completePassword', request));
exports.manageStaffAccount = onCall(staffLifecycleOptions, (request) => runStaffLifecycle('manage', request));

// Preserve the legacy callable contract while retiring its Firestore writer.
exports.syncManagedStaffDirectory = onCall(staffLifecycleOptions, async (request) => {
  try {
    const page = await createStaffDirectory({ auth: admin.auth(), store: sqlStaffStore(staffSql()) })({ ...request, data: { limit: 1 } });
    return { imported: page.total };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('unavailable', 'The staff directory could not be synchronised. Please try again.');
  }
});

exports.getSqlStaffDirectory = onCall({ ...callableOptions, timeoutSeconds: 60, memory: '256MiB', maxInstances: 1, concurrency: 1 }, async (request) => {
  try {
    const dc = getDataConnect({ serviceId: 'ak-sood-clinic-service', location: 'asia-south1', connector: 'clinic-admin' });
    return await createStaffDirectory({ auth: admin.auth(), store: sqlStaffStore(dc) })(request);
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw new HttpsError('unavailable', 'The staff directory could not be loaded. Please try again.');
  }
});

const clinicContactService = () => createClinicContact({
  auth: admin.auth(),
  store: sqlClinicContactStore(getDataConnect({ serviceId: 'ak-sood-clinic-service', location: 'asia-south1', connector: 'clinic-admin' })),
});
exports.getAdminClinicContact = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB', maxInstances: 1 }, request => clinicContactService().get(request));
exports.saveAdminClinicContact = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB', maxInstances: 1 }, request => clinicContactService().save(request));

const sqlCatalogueService = () => createSqlCatalogue({
  auth: admin.auth(),
  store: sqlCatalogueStore(getDataConnect({ serviceId: 'ak-sood-clinic-service', location: 'asia-south1', connector: 'clinic-admin' })),
});
const bookingSettingsService = () => createBookingSettings({
  auth: admin.auth(),
  store: sqlBookingSettingsStore(getDataConnect({ serviceId: 'ak-sood-clinic-service', location: 'asia-south1', connector: 'clinic-admin' })),
});

const bookingReads = () => createBookingReads({
  sql: {
    catalogue: () => sqlCatalogueService().public(),
    config: () => bookingSettingsService().runtime(),
  },
  firestore: {
    catalogue: async () => {
      const [branches, departments, doctors] = await Promise.all(['branches', 'departments', 'doctors'].map((name) => db.collection(name).get()));
      const rows = (snapshot) => snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      return firestoreCatalogue({ branches: rows(branches), departments: rows(departments), doctors: rows(doctors) });
    },
    config: async () => firestoreConfig((await db.collection('clinic').doc('publicConfig').get()).data()),
  },
});

// Public booking reads its catalogue through this narrow contract rather than
// embedding clinic/doctor IDs in the client.
exports.getBookingCatalog = onCall({ ...bookingCallableOptions, timeoutSeconds: 30, memory: '256MiB' }, async () => {
  const reads = bookingReads();
  const [catalogue, config] = await Promise.all([reads.catalogue(), reads.config()]);
  return { ...catalogue, booking: { bookingWindowDays: config.bookingWindowDays, cancelCutoffMinutes: config.cancelCutoffMinutes, visitTypes: config.visitTypes.filter(item => item.active).map(({ id, label, minutes, mode }) => ({ id, label, minutes, mode })) } };
});


// Catalogue readers, editors and booking validation move together; no Firestore fallback.
exports.getAdminBookingCatalog = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, request => sqlCatalogueService().get(request));
exports.manageBookingCatalog = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, request => sqlCatalogueService().save(request));

// Visit formats are configuration rather than a client-side convention. This
// keeps the public selector, appointment record and staff video workflow on one
// server-validated contract, and makes a future data-store migration explicit.
exports.getAdminBookingConfiguration = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, request => bookingSettingsService().get(request));
exports.saveBookingVisitTypes = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, request => bookingSettingsService().saveService(request));
exports.saveBookingPolicy = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, request => bookingSettingsService().saveSettings(request));

// --- Appointment engine ----------------------------------------------------
// Firestore is the sole appointment authority. Google Calendar is deliberately
// an external busy-time source and best-effort event mirror, never a replacement
// for the transaction below.

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
  await requireLiveAdmin(admin.auth(), request);
  const requestedLimit = Number(request.data?.limit);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 30;
  let snapshot; let sqlEvents;
  try {
    const { listStaffAudit } = require('./generated/sql');
    const results = await Promise.all([
      db.collection('auditLogs').orderBy('at', 'desc').limit(limit).get(),
      listStaffAudit(staffSql(), { limit }),
    ]);
    snapshot = results[0]; sqlEvents = results[1].data.auditLogs;
  } catch { throw new HttpsError('unavailable', 'The activity log could not be loaded. Please try again.'); }
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
  const staffEvents = sqlEvents.map((row) => ({
    id: 'sql:' + row.id, at: row.occurredAt, action: row.action, actorRole: row.actorRole,
    actorUid: row.actorUid, resourceType: row.resourceType, resourceId: row.resourceId, targetUid: null,
  }));
  return { events: [...events, ...staffEvents].sort((a, b) => (b.at || '').localeCompare(a.at || '')).slice(0, limit) };
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
  await requireAdmin(request);
  const snapshot = await db.collection('patientFeedback').where('status', '==', 'pending').orderBy('createdAt', 'desc').limit(30).get();
  return { feedback: snapshot.docs.map((item) => ({ id: item.id, appointmentId: item.get('appointmentId'), rating: item.get('rating'), comment: item.get('comment') })) };
});

exports.moderatePatientFeedback = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  await requireAdmin(request);
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
const isActiveAppointment = (status) => !['cancelled', 'completed', 'no_show'].includes(status);
const appointmentReference = () => `SC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const functionsProject = () => process.env.GCLOUD_PROJECT || 'sood-clinic';
const googleCallbackUrl = () => `https://asia-south1-${functionsProject()}.cloudfunctions.net/googleCalendarCallback`;
const BOOKING_RATE_LIMIT = 10;
const BOOKING_RATE_WINDOW_MS = 60 * 60 * 1000;

const enforceBookingRateLimit = async (request) => {
  const ip = String(request.rawRequest?.ip || '');
  const rateLimitId = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32);
  const rateLimitRef = db.collection('rateLimits').doc(rateLimitId);
  const now = new Date();
  const resetAt = new Date(now.getTime() + BOOKING_RATE_WINDOW_MS);

  await db.runTransaction(async (transaction) => {
    const existing = await transaction.get(rateLimitRef);
    const existingResetAt = asDate(existing.get('resetAt'));
    const count = existing.exists && existingResetAt && existingResetAt > now
      ? Number(existing.get('count')) || 0
      : 0;
    if (count >= BOOKING_RATE_LIMIT) {
      throw publicError('resource-exhausted', 'Too many booking attempts. Please try again in an hour.');
    }
    transaction.set(rateLimitRef, {
      count: count + 1,
      resetAt: Timestamp.fromDate(resetAt),
    });
  });
};

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


// Phase 6 hold path, exported for review with the rest of the scheduler slice.
// The doctor's SQL UUID is resolved server-side here: the public catalogue exposes
// only legacy ids, and `place` reads the schedule again for the claim itself, so one
// bounded day read buys the identity. Two limits stand in for a rate limiter while
// the Phase 6 throttling decision is open: App Check is enforced, and maxInstances
// is capped at the same 1 used by the SQL patient backends.
const schedulerDc = () => getDataConnect({ serviceId: 'ak-sood-clinic-service', location: 'asia-south1', connector: 'clinic-admin' });

const schedulerDoctorIdentity = async ({ actorUid, doctorLegacyId, visitTypeId, dateKey }) => {
  const rangeStart = istInstant(dateKey);
  const rangeEnd = new Date(rangeStart.getTime() + 24 * 60 * 60 * 1000);
  const source = await sqlSchedulerAvailabilityStore(schedulerDc()).read({ actorUid, doctorLegacyId, dateKey, rangeStart: rangeStart.toISOString(), rangeEnd: rangeEnd.toISOString() });
  const doctors = Array.isArray(source?.doctors) ? source.doctors : [];
  // Ambiguous or missing rows leave the UUID unset; the handler refuses rather than
  // trusting a client-supplied identity.
  const doctorId = doctors.length === 1 ? doctors[0].id : null;
  return { doctorId, visitType: selectVisitType(await bookingReads().config(), visitTypeId) };
};

// Guest identity is still unresolved: the claim requires an active SQL user row, so
// an anonymous hold fails closed until the guest-relation gate is reviewed. This
// callable is not wired to any client yet.
exports.holdAppointment = onCall({
  ...bookingCallableOptions, enforceAppCheck: true, maxInstances: 1, timeoutSeconds: 30, memory: '256MiB',
}, createSchedulerHoldHandler({
  holds: createSqlSchedulerHolds({
    availability: createSqlSchedulerAvailability({ store: sqlSchedulerAvailabilityStore(schedulerDc()) }),
    claims: createSqlSchedulerClaims({ store: sqlSchedulerClaimStore(schedulerDc()) }),
  }),
  resolveDoctor: schedulerDoctorIdentity,
}));

const slotBusyRanges = async (doctorId, dateKey) => {
  const snapshot = await db.collection('appointmentSlots').where('doctorId', '==', doctorId).where('dateKey', '==', dateKey).get();
  return snapshot.docs.map((item) => item.data()).filter((item) => ['booked', 'blocked', 'held'].includes(item.status))
    .map((item) => {
      const startsAt = asDate(item.startsAt);
      return startsAt ? { startsAt, endsAt: asDate(item.endsAt) || new Date(startsAt.getTime() + 20 * 60 * 1000) } : null;
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

const externalBusyRanges = async ({ doctorId, dateKey }) => {
  const connection = await calendarConnection(doctorId);
  if (!connection) return { ranges: [], calendar: { connected: false } };
  try {
    const { accessToken, calendarId } = await calendarAccess(connection);
    const start = new Date(`${dateKey}T00:00:00+05:30`);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
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

const availabilityContext = async ({ doctorId, dateKey, visitTypeId }) => {
  const reads = bookingReads();
  const [doctor, legacySchedule, scheduleSnapshot, exceptionSnapshot, config] = await Promise.all([
    reads.doctor(doctorId),
    // Legacy embedded hours remain a scheduling source, never catalogue authority.
    db.collection('doctors').doc(doctorId).get(),
    db.collection('doctorSchedules').doc(doctorId).get(),
    db.collection('scheduleExceptions').doc(`${doctorId}_${dateKey}`).get(),
    reads.config(),
  ]);
  const visitType = selectVisitType(config, visitTypeId);
  const [slots, external] = await Promise.all([slotBusyRanges(doctorId, dateKey), externalBusyRanges({ doctorId, dateKey })]);
  return {
    doctor,
    weeklySessions: (scheduleSnapshot.get('sessions') || legacySchedule.get('weeklySchedule') || []).map((session) => ({
      weekday: session.weekday,
      start: session.start || session.startTime,
      end: session.end || session.endTime,
    })),
    exception: exceptionSnapshot.exists ? exceptionSnapshot.data() : null,
    config,
    visitType,
    busyRanges: [...slots, ...external.ranges],
    externalCalendar: external.calendar,
  };
};

exports.getAvailability = onCall({ ...bookingCallableOptions, timeoutSeconds: 30, memory: '256MiB', secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_KEY] }, async (request) => {
  const { doctorId, dateKey, visitTypeId } = request.data || {};
  if (!doctorId || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) throw publicError('invalid-argument', 'Choose a doctor and appointment date.');
  const context = await availabilityContext({ doctorId, dateKey, visitTypeId });
  const slots = buildAvailability({ doctorId, dateKey, weeklySessions: context.weeklySessions, exception: context.exception, durationMinutes: context.visitType.minutes, intervalMinutes: context.config.intervalMinutes, bufferBeforeMinutes: context.config.bufferBeforeMinutes, bufferAfterMinutes: context.config.bufferAfterMinutes, leadMinutes: context.config.leadMinutes, bookingWindowDays: context.config.bookingWindowDays, busyRanges: context.busyRanges });
  return { timezone: context.config.timezone, visitType: { id: context.visitType.id, label: context.visitType.label, minutes: context.visitType.minutes, mode: context.visitType.mode }, calendar: context.externalCalendar, slots: slots.map((slot) => ({ slotId: slot.slotId, startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString(), time: slot.time })) };
});

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
    await appointmentRef.set({ externalCalendar: { provider: 'google', calendarId, eventId: event.id, syncStatus: 'synced', lastSyncedAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch (_error) {
    await appointmentRef.set({ externalCalendar: { provider: 'google', syncStatus: 'pending', lastSyncError: 'Calendar event could not be synced.' }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
};

const deleteAppointmentFromGoogle = async ({ ref, appointment }) => {
  if (!appointment.externalCalendar?.eventId) return;
  try {
    const connection = await calendarConnection(appointment.doctorId);
    if (!connection) return;
    const { accessToken, calendarId } = await calendarAccess(connection);
    await deleteEvent({ accessToken, calendarId, eventId: appointment.externalCalendar.eventId });
    await ref.set({ externalCalendar: { ...appointment.externalCalendar, syncStatus: 'deleted', eventId: FieldValue.delete(), lastSyncedAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  } catch (_error) {
    await ref.set({ externalCalendar: { ...appointment.externalCalendar, syncStatus: 'pending', lastSyncError: 'Calendar event could not be removed.' }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
};

exports.createBooking = onCall({ ...bookingCallableOptions, timeoutSeconds: 30, memory: '256MiB', secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_KEY] }, async (request) => {
  const { branchId, departmentId, doctorId, dateKey, time, visitTypeId, patient, reason, consentVersion, clientRequestId } = request.data || {};
  if (!branchId || !departmentId || !doctorId || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || '')) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || ''))) throw publicError('invalid-argument', 'Choose a valid appointment time.');
  if (!validClientRequestId(clientRequestId)) throw publicError('invalid-argument', 'Please refresh and try booking again.');
  const name = trimmed(patient?.name, 120);
  const phone = trimmed(patient?.phone, 30);
  const email = normalizeEmail(patient?.email);
  if (!name || !validPhone(phone) || patient?.consentToTreatment !== true) throw publicError('invalid-argument', 'Enter your name, a valid phone number, and consent to the appointment terms.');
  if (email && !isEmail(email)) throw publicError('invalid-argument', 'Enter a valid email address.');
  const phoneKey = toE164(phone);
  if (!phoneKey) throw publicError('invalid-argument', 'Enter a valid Indian phone number.');
  const requestRef = db.collection('bookingRequests').doc(clientRequestId);
  const slotRef = db.collection('appointmentSlots').doc(makeSlotId(doctorId, dateKey, time));
  // A retry after a lost acknowledgement must return the original booking, not a
  // "time is no longer available" refusal: the confirmed slot removes that time from
  // `buildAvailability`, so this replay check has to run before the availability
  // preflight (the transaction below still re-checks it atomically). Returned only to
  // the caller who already knows the client request id it generated.
  const replayed = await requestRef.get();
  if (replayed.exists) {
    return { appointmentId: replayed.get('appointmentId'), reference: replayed.get('reference'), status: replayed.get('status'), idempotent: true };
  }
  await enforceBookingRateLimit(request);
  await assertPhoneBookingCapacity(phoneKey);
  const context = await availabilityContext({ doctorId, dateKey, visitTypeId });
  const appointmentSlots = buildAvailability({ doctorId, dateKey, weeklySessions: context.weeklySessions, exception: context.exception, durationMinutes: context.visitType.minutes, intervalMinutes: context.config.intervalMinutes, bufferBeforeMinutes: context.config.bufferBeforeMinutes, bufferAfterMinutes: context.config.bufferAfterMinutes, leadMinutes: context.config.leadMinutes, bookingWindowDays: context.config.bookingWindowDays, busyRanges: context.busyRanges });
  const requested = appointmentSlots.find((slot) => slot.time === time);
  if (!requested) {
    // A time removed from availability because someone else just booked it is a
    // conflict, not a validation failure: the booking page recovers from
    // `already-exists` by dropping the taken slot, which `failed-precondition` skips.
    const taken = await slotRef.get();
    if (taken.exists && taken.get('status') === 'booked') throw publicError('already-exists', 'That time has just been booked. Please choose another slot.');
    throw publicError('failed-precondition', 'That time is no longer available. Please choose another slot.');
  }
  // Same catalogue check as `validateSelection`, on the doctor already resolved for
  // this request, so one booking reads the catalogue once.
  if (context.doctor.branchId !== branchId || !context.doctor.departmentIds.includes(departmentId)) throw publicError('failed-precondition', 'The selected clinic service is not available.');

  const exceptionRef = db.collection('scheduleExceptions').doc(`${doctorId}_${dateKey}`);
  const appointmentRef = db.collection('appointments').doc();
  const reference = appointmentReference();
  const role = roleFor(request.auth);
  let result;
  try {
    await db.runTransaction(async (transaction) => {
      const [prior, slot, currentException] = await Promise.all([transaction.get(requestRef), transaction.get(slotRef), transaction.get(exceptionRef)]);
      if (prior.exists) {
        result = { appointmentId: prior.get('appointmentId'), reference: prior.get('reference'), status: prior.get('status'), idempotent: true };
        return;
      }
      if (slot.exists) {
        if (slot.get('status') === 'booked') throw publicError('already-exists', 'That time has just been booked. Please choose another slot.');
        throw publicError('failed-precondition', 'That time is no longer available. Please choose another slot.');
      }
      if (currentException.exists && currentException.get('type') === 'closed') throw publicError('failed-precondition', 'This clinic day has just been closed. Please choose another time.');
      const status = context.config.autoConfirm ? 'confirmed' : 'scheduled';
      const createdBy = request.auth ? { uid: request.auth.uid, role } : { uid: null, role: 'public' };
      transaction.set(slotRef, { doctorId, dateKey, startsAt: Timestamp.fromDate(requested.startsAt), endsAt: Timestamp.fromDate(requested.endsAt), appointmentId: appointmentRef.id, status: 'booked', createdAt: FieldValue.serverTimestamp() });
      transaction.set(appointmentRef, {
        reference, branchId, departmentId, doctorId, visitType: context.visitType.id, visitMode: context.visitType.mode, dateKey,
        startsAt: Timestamp.fromDate(requested.startsAt), endsAt: Timestamp.fromDate(requested.endsAt),
        status, source: request.auth ? 'patient_portal' : 'web', patientId: request.auth?.uid || null,
        patientSnapshot: { name, phone, email: email || null }, phoneKey, reason: trimmed(reason, 500) || null, slotIds: [slotRef.id],
        consent: { version: trimmed(consentVersion, 40) || 'booking-v1', acceptedAt: FieldValue.serverTimestamp() },
        createdBy, externalCalendar: { provider: 'google', syncStatus: 'not_connected' }, videoConsultation: context.visitType.mode === 'video' ? { status: 'awaiting_link' } : null, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(appointmentRef.collection('events').doc(), { from: null, to: status, byUid: createdBy.uid, byRole: createdBy.role, at: FieldValue.serverTimestamp(), meta: { source: request.auth ? 'patient_portal' : 'web' } });
      transaction.set(db.collection('auditLogs').doc(), { at: FieldValue.serverTimestamp(), actor: createdBy, action: 'appointment_created', resource: { type: 'appointment', id: appointmentRef.id }, meta: { source: request.auth ? 'patient_portal' : 'web', status } });
      transaction.set(requestRef, { appointmentId: appointmentRef.id, reference, status, createdAt: FieldValue.serverTimestamp() });
      result = { appointmentId: appointmentRef.id, reference, status, idempotent: false };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw publicError('internal', 'We could not reserve this time. Please try again.');
  }
  if (!result.idempotent) await syncAppointmentToGoogle(result.appointmentId);
  return result;
});

const requireVideoStaff = async (request) => {
  const user = await requireLiveStaff(admin.auth(), request);
  return user.customClaims.role;
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
  const role = await requireVideoStaff(request);
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
  const role = await requireVideoStaff(request);
  const appointmentId = trimmed(request.data?.appointmentId, 200);
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(appointmentId)) throw publicError('invalid-argument', 'Choose a valid online appointment.');
  const joinUrl = safeVideoUrl(request.data?.joinUrl);
  const ref = db.collection('appointments').doc(appointmentId);
  const videoConsultation = joinUrl
    ? { status: 'ready', joinUrl, preparedBy: request.auth.uid, preparedAt: FieldValue.serverTimestamp() }
    : { status: 'awaiting_link', clearedBy: request.auth.uid, clearedAt: FieldValue.serverTimestamp() };
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.get('visitMode') !== 'video') throw publicError('not-found', 'Online appointment not found.');
    const appointment = snapshot.data();
    if (role === 'doctor' && appointment.doctorId !== request.auth.token.doctorId) throw publicError('permission-denied', 'You can only prepare access for your own appointments.');
    if (!isActiveAppointment(appointment.status)) throw publicError('failed-precondition', 'Video access cannot be changed after the appointment is closed.');
    transaction.update(ref, { videoConsultation, updatedAt: FieldValue.serverTimestamp() });
    transaction.set(db.collection('auditLogs').doc(), { at: FieldValue.serverTimestamp(), actor: { uid: request.auth.uid, role }, action: joinUrl ? 'video_access_prepared' : 'video_access_cleared', resource: { type: 'appointment', id: appointmentId }, meta: { visitMode: 'video' } });
  });
  return { message: joinUrl ? 'Secure video access is ready for the patient.' : 'Video access was cleared.' };
});

// All appointment lifecycle changes happen on the trusted server. Browser clients
// may read appointments, but Firestore rules intentionally deny direct writes.
// The invoker stays public like every other callable in this project: the Cloud Run
// binding is not an authorization layer, and `requireLiveStaff` below is.
exports.transitionAppointment = onCall({ ...callableOptions, invoker: 'public', timeoutSeconds: 30, memory: '256MiB', secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_KEY] }, async (request) => {
  const user = await requireLiveStaff(admin.auth(), request);
  const role = user.customClaims.role;
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
    // The transition table alone would let a manager mark a future appointment as
    // a no-show, or check in a patient on the wrong day. Both are time conditions
    // in the target design and are enforced here, not only in the UI.
    if (to === 'no_show' && !canMarkNoShow({ appointment, graceMinutes: NO_SHOW_GRACE_MINUTES })) throw publicError('failed-precondition', `A no-show can only be recorded ${NO_SHOW_GRACE_MINUTES} minutes after the appointment start time.`);
    if (to === 'checked_in' && appointment.dateKey !== istDateKey()) throw publicError('failed-precondition', 'Check-in is only available on the appointment day.');
    const now = FieldValue.serverTimestamp();
    const update = { status: to, updatedAt: now };
    if (to === 'cancelled') update.cancellation = { byUid: request.auth.uid, byRole: role, reason: cancellationReason, at: now };
    transaction.update(ref, update);
    if (to === 'cancelled') {
      const slotIds = Array.isArray(appointment.slotIds) && appointment.slotIds.length ? appointment.slotIds : (appointment.slotId ? [appointment.slotId] : []);
      slotIds.forEach((slotId) => transaction.delete(db.collection('appointmentSlots').doc(slotId)));
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
exports.cancelPatientAppointment = onCall({ ...bookingCallableOptions, timeoutSeconds: 30, memory: '256MiB', secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_KEY] }, async (request) => {
  if (!request.auth || isStaffRole(request.auth.token.role)) throw publicError('permission-denied', 'Sign in to cancel your appointment.');
  const appointmentId = trimmed(request.data?.appointmentId, 200);
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(appointmentId)) throw publicError('invalid-argument', 'Invalid appointment.');
  const reason = trimmed(request.data?.reason, 300) || 'Cancelled by patient';
  const config = await bookingReads().config();
  const ref = db.collection('appointments').doc(appointmentId);
  let cancelledAppointment;
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw publicError('not-found', 'Appointment not found.');
    const appointment = snapshot.data();
    if (!canPatientCancel({ appointment, uid: request.auth.uid, cutoffHours: config.patientCancellationCutoffHours })) throw publicError('failed-precondition', 'This appointment can no longer be cancelled online. Please contact the clinic.');
    const now = FieldValue.serverTimestamp();
    transaction.update(ref, { status: 'cancelled', cancellation: { byUid: request.auth.uid, byRole: 'patient', reason, at: now }, updatedAt: now });
    const slotIds = Array.isArray(appointment.slotIds) && appointment.slotIds.length ? appointment.slotIds : (appointment.slotId ? [appointment.slotId] : []);
    slotIds.forEach((slotId) => transaction.delete(db.collection('appointmentSlots').doc(slotId)));
    cancelledAppointment = { ref, appointment };
    transaction.set(ref.collection('events').doc(), { from: appointment.status, to: 'cancelled', byUid: request.auth.uid, byRole: 'patient', reason, at: now });
    transaction.set(db.collection('auditLogs').doc(), { at: now, actor: { uid: request.auth.uid, role: 'patient' }, action: 'appointment_cancelled', resource: { type: 'appointment', id: ref.id }, meta: { source: 'patient_portal' } });
  });
  if (cancelledAppointment) await deleteAppointmentFromGoogle(cancelledAppointment);
  return { ok: true, status: 'cancelled' };
});

// Patients may move an eligible future appointment, but all availability and
// slot ownership decisions remain on the trusted server.
exports.reschedulePatientAppointment = onCall({ ...bookingCallableOptions, timeoutSeconds: 30, memory: '256MiB', secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_KEY] }, async (request) => {
  if (!request.auth || isStaffRole(request.auth.token.role)) throw publicError('permission-denied', 'Sign in to reschedule your appointment.');
  const appointmentId = trimmed(request.data?.appointmentId, 200);
  const dateKey = trimmed(request.data?.dateKey, 10);
  const time = trimmed(request.data?.time, 5);
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(appointmentId) || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw publicError('invalid-argument', 'Choose a valid new appointment time.');

  const config = await bookingReads().config();
  const ref = db.collection('appointments').doc(appointmentId);
  const initial = await ref.get();
  if (!initial.exists) throw publicError('not-found', 'Appointment not found.');
  const initialAppointment = initial.data();
  if (!canPatientCancel({ appointment: initialAppointment, uid: request.auth.uid, cutoffHours: config.patientCancellationCutoffHours })) throw publicError('failed-precondition', 'This appointment can no longer be changed online. Please contact the clinic.');
  const context = await availabilityContext({ doctorId: initialAppointment.doctorId, dateKey, visitTypeId: initialAppointment.visitType });
  const availableSlots = buildAvailability({ doctorId: initialAppointment.doctorId, dateKey, weeklySessions: context.weeklySessions, exception: context.exception, durationMinutes: context.visitType.minutes, intervalMinutes: context.config.intervalMinutes, bufferBeforeMinutes: context.config.bufferBeforeMinutes, bufferAfterMinutes: context.config.bufferAfterMinutes, leadMinutes: context.config.leadMinutes, bookingWindowDays: context.config.bookingWindowDays, busyRanges: context.busyRanges });
  const requested = availableSlots.find((slot) => slot.time === time);
  if (!requested) throw publicError('failed-precondition', 'That time is no longer available. Please choose another slot.');
  const newSlotRef = db.collection('appointmentSlots').doc(makeSlotId(initialAppointment.doctorId, dateKey, time));
  let result;
  await db.runTransaction(async (transaction) => {
    const [snapshot, newSlot] = await Promise.all([transaction.get(ref), transaction.get(newSlotRef)]);
    if (!snapshot.exists) throw publicError('not-found', 'Appointment not found.');
    const appointment = snapshot.data();
    if (!canPatientCancel({ appointment, uid: request.auth.uid, cutoffHours: config.patientCancellationCutoffHours })) throw publicError('failed-precondition', 'This appointment can no longer be changed online. Please contact the clinic.');
    const existingSlotIds = Array.isArray(appointment.slotIds) && appointment.slotIds.length ? appointment.slotIds : (appointment.slotId ? [appointment.slotId] : []);
    if (existingSlotIds.includes(newSlotRef.id)) throw publicError('failed-precondition', 'Choose a different appointment time.');
    if (newSlot.exists) throw publicError('already-exists', 'That time has just been booked. Please choose another slot.');
    const now = FieldValue.serverTimestamp();
    existingSlotIds.forEach((slotId) => transaction.delete(db.collection('appointmentSlots').doc(slotId)));
    transaction.set(newSlotRef, { doctorId: appointment.doctorId, dateKey, startsAt: Timestamp.fromDate(requested.startsAt), endsAt: Timestamp.fromDate(requested.endsAt), appointmentId: ref.id, status: 'booked', createdAt: now });
    transaction.update(ref, { dateKey, startsAt: Timestamp.fromDate(requested.startsAt), endsAt: Timestamp.fromDate(requested.endsAt), slotIds: [newSlotRef.id], updatedAt: now, externalCalendar: { ...(appointment.externalCalendar || {}), syncStatus: appointment.externalCalendar?.eventId ? 'pending' : 'not_connected' } });
    transaction.set(ref.collection('events').doc(), { from: appointment.status, to: appointment.status, byUid: request.auth.uid, byRole: 'patient', at: now, meta: { action: 'rescheduled', fromDateKey: appointment.dateKey, toDateKey: dateKey, toTime: time } });
    transaction.set(db.collection('auditLogs').doc(), { at: now, actor: { uid: request.auth.uid, role: 'patient' }, action: 'appointment_rescheduled', resource: { type: 'appointment', id: ref.id }, meta: { fromDateKey: appointment.dateKey, toDateKey: dateKey } });
    result = { appointmentId: ref.id, dateKey, time, status: appointment.status };
  });

  // Calendar synchronization is a mirror of the clinic's appointment record;
  // a transient Google failure never rolls back a successfully reserved slot.
  try {
    const appointment = (await ref.get()).data();
    if (appointment.externalCalendar?.eventId) {
      const connection = await calendarConnection(appointment.doctorId);
      if (connection) {
        const { accessToken, calendarId } = await calendarAccess(connection);
        await updateEventTime({ accessToken, calendarId, eventId: appointment.externalCalendar.eventId, startsAt: asDate(appointment.startsAt).toISOString(), endsAt: asDate(appointment.endsAt).toISOString() });
        await ref.set({ externalCalendar: { ...appointment.externalCalendar, syncStatus: 'synced', lastSyncedAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
  } catch (_error) {
    await ref.set({ externalCalendar: { provider: 'google', syncStatus: 'pending', lastSyncError: 'Calendar event could not be updated.' }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  return { ok: true, ...result };
});

// Staff rescheduling moves an upcoming appointment to a free time on the same
// doctor's schedule. The old slot is released and the new one reserved in the
// same transaction, so a reschedule can never free a slot without taking one.
exports.rescheduleAppointment = onCall({ ...callableOptions, timeoutSeconds: 30, memory: '256MiB', secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_KEY] }, async (request) => {
  const user = await requireLiveStaff(admin.auth(), request);
  const role = user.customClaims.role;
  const appointmentId = trimmed(request.data?.appointmentId, 200);
  const dateKey = trimmed(request.data?.dateKey, 10);
  const time = trimmed(request.data?.time, 5);
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(appointmentId) || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw publicError('invalid-argument', 'Choose a valid new appointment time.');
  const ref = db.collection('appointments').doc(appointmentId);
  const initial = await ref.get();
  if (!initial.exists) throw publicError('not-found', 'Appointment not found.');
  const appointment = initial.data();
  if (role === 'doctor' && appointment.doctorId !== request.auth.token.doctorId) throw publicError('permission-denied', 'You can only reschedule your own appointments.');
  if (!canStaffReschedule({ appointment, role, actorDoctorId: request.auth.token.doctorId })) throw publicError('failed-precondition', 'Only an upcoming appointment can be rescheduled.');
  const context = await availabilityContext({ doctorId: appointment.doctorId, dateKey, visitTypeId: appointment.visitType });
  const availableSlots = buildAvailability({ doctorId: appointment.doctorId, dateKey, weeklySessions: context.weeklySessions, exception: context.exception, durationMinutes: context.visitType.minutes, intervalMinutes: context.config.intervalMinutes, bufferBeforeMinutes: context.config.bufferBeforeMinutes, bufferAfterMinutes: context.config.bufferAfterMinutes, leadMinutes: context.config.leadMinutes, bookingWindowDays: context.config.bookingWindowDays, busyRanges: context.busyRanges });
  const requested = availableSlots.find((slot) => slot.time === time);
  if (!requested) throw publicError('failed-precondition', 'That time is no longer available. Please choose another slot.');
  const newSlotRef = db.collection('appointmentSlots').doc(makeSlotId(appointment.doctorId, dateKey, time));
  let result;
  await db.runTransaction(async (transaction) => {
    const [snapshot, newSlot] = await Promise.all([transaction.get(ref), transaction.get(newSlotRef)]);
    if (!snapshot.exists) throw publicError('not-found', 'Appointment not found.');
    const current = snapshot.data();
    if (role === 'doctor' && current.doctorId !== request.auth.token.doctorId) throw publicError('permission-denied', 'You can only reschedule your own appointments.');
    if (!canStaffReschedule({ appointment: current, role, actorDoctorId: request.auth.token.doctorId })) throw publicError('failed-precondition', 'Only an upcoming appointment can be rescheduled.');
    const existingSlotIds = Array.isArray(current.slotIds) && current.slotIds.length ? current.slotIds : (current.slotId ? [current.slotId] : []);
    if (existingSlotIds.includes(newSlotRef.id)) throw publicError('failed-precondition', 'Choose a different appointment time.');
    if (newSlot.exists) throw publicError('already-exists', 'That time has just been booked. Please choose another slot.');
    const now = FieldValue.serverTimestamp();
    existingSlotIds.forEach((slotId) => transaction.delete(db.collection('appointmentSlots').doc(slotId)));
    transaction.set(newSlotRef, { doctorId: current.doctorId, dateKey, startsAt: Timestamp.fromDate(requested.startsAt), endsAt: Timestamp.fromDate(requested.endsAt), appointmentId: ref.id, status: 'booked', createdAt: now });
    transaction.update(ref, { dateKey, startsAt: Timestamp.fromDate(requested.startsAt), endsAt: Timestamp.fromDate(requested.endsAt), slotIds: [newSlotRef.id], updatedAt: now, externalCalendar: { ...(current.externalCalendar || {}), syncStatus: current.externalCalendar?.eventId ? 'pending' : 'not_connected' } });
    transaction.set(ref.collection('events').doc(), { from: current.status, to: current.status, byUid: request.auth.uid, byRole: role, at: now, meta: { action: 'rescheduled', fromDateKey: current.dateKey, toDateKey: dateKey, toTime: time } });
    transaction.set(db.collection('auditLogs').doc(), { at: now, actor: { uid: request.auth.uid, role }, action: 'appointment_rescheduled', resource: { type: 'appointment', id: ref.id }, meta: { fromDateKey: current.dateKey, toDateKey: dateKey, byStaff: true } });
    result = { appointmentId: ref.id, dateKey, time, status: current.status };
  });

  // The Google Calendar event is a mirror of the clinic record; a transient
  // provider failure must not roll back the slot that was just reserved.
  try {
    const saved = (await ref.get()).data();
    if (saved.externalCalendar?.eventId) {
      const connection = await calendarConnection(saved.doctorId);
      if (connection) {
        const { accessToken, calendarId } = await calendarAccess(connection);
        await updateEventTime({ accessToken, calendarId, eventId: saved.externalCalendar.eventId, startsAt: asDate(saved.startsAt).toISOString(), endsAt: asDate(saved.endsAt).toISOString() });
        await ref.set({ externalCalendar: { ...saved.externalCalendar, syncStatus: 'synced', lastSyncedAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      }
    }
  } catch (_error) {
    await ref.set({ externalCalendar: { provider: 'google', syncStatus: 'pending', lastSyncError: 'Calendar event could not be updated.' }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  return { ok: true, ...result };
});

// Closing a day must be deliberate: staff first preview affected appointments,
// then explicitly keep them or cancel every appointment they are permitted to cancel.
exports.closeDay = onCall({ ...callableOptions, timeoutSeconds: 60, memory: '256MiB', secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_KEY] }, async (request) => {
  const { doctorId, dateKey, mode = 'preview', action = 'keep', reason } = request.data || {};
  const user = await requireLiveStaff(admin.auth(), request, { roles: ['admin', 'doctor'], doctorId });
  const role = user.customClaims.role;
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
      if (appointment.doctorId !== doctorId) throw publicError('failed-precondition', 'An appointment changed doctor. Refresh the clinic day before continuing.');
      if (!isActiveAppointment(appointment.status)) return;
      if (action === 'cancel') {
        if (!canTransition(appointment.status, 'cancelled', role)) throw publicError('failed-precondition', 'An appointment changed and cannot be cancelled by your role. Review the day again.');
        transaction.update(snapshot.ref, { status: 'cancelled', cancellation: { byUid: request.auth.uid, byRole: role, reason: closeReason, at: now }, updatedAt: now });
        const slotIds = Array.isArray(appointment.slotIds) && appointment.slotIds.length ? appointment.slotIds : (appointment.slotId ? [appointment.slotId] : []);
        slotIds.forEach((slotId) => transaction.delete(db.collection('appointmentSlots').doc(slotId)));
        cancelledAppointments.push({ ref: snapshot.ref, appointment });
        transaction.set(snapshot.ref.collection('events').doc(), { from: appointment.status, to: 'cancelled', byUid: request.auth.uid, byRole: role, reason: closeReason, at: now, meta: { source: 'close_day', dateKey } });
      }
    });
    transaction.set(db.collection('auditLogs').doc(), { at: now, actor: { uid: request.auth.uid, role }, action: 'clinic_day_closed', resource: { type: 'schedule_exception', id: exceptionRef.id }, meta: { doctorId, dateKey, action, affectedAppointments: appointments.length } });
  });
  await Promise.all(cancelledAppointments.map((item) => deleteAppointmentFromGoogle(item)));
  return { ok: true, doctorId, dateKey, action, affectedAppointments: appointments.length };
});

// --- Google Calendar connection -------------------------------------------
// This is clinic-admin initiated only. Browser code receives an OAuth URL but
// never receives a client secret, refresh token, or another calendar's events.
exports.beginGoogleCalendarConnection = onCall({ ...callableOptions, secrets: [GOOGLE_CALENDAR_CLIENT_ID] }, async (request) => {
  await requireAdmin(request);
  const { doctorId = 'brig-ak-sood', calendarId = 'primary' } = request.data || {};
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
    const issuedAt = asDate(stateSnapshot.get('createdAt'));
    await requireOAuthAdministrator(admin.auth(), stateSnapshot.get('requestedBy'), issuedAt?.getTime());
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
  await requireAdmin(request);
  const snapshot = await db.collection('integrations').doc('googleCalendar').get();
  if (!snapshot.exists) return { connected: false };
  const value = snapshot.data();
  return { connected: value.active === true, doctorId: value.doctorId, calendarId: value.calendarId, syncStatus: value.syncStatus || 'unknown', lastSyncError: value.lastSyncError || null };
});

exports.disconnectGoogleCalendar = onCall({ ...callableOptions }, async (request) => {
  await requireAdmin(request);
  await db.collection('integrations').doc('googleCalendar').set({ active: false, disconnectedAt: FieldValue.serverTimestamp(), disconnectedBy: request.auth.uid, syncStatus: 'disconnected' }, { merge: true });
  return { disconnected: true };
});

// SQL patient slice: handlers already enforce App Check, live patient/staff Auth
// and the durable link-attempt guard; the coordinated cutover (mounting the
// staged pages, retiring legacy readers) stays behind the release gates.
const sqlPatientHandler = name => request => createSqlPatientBackend({ auth: admin.auth(), dc: staffSql() })[name](request);
exports.listSqlPatientProfiles = onCall(sqlPatientCallableOptions, sqlPatientHandler('listSqlPatientProfiles'));
exports.getSqlPatientProfile = onCall(sqlPatientCallableOptions, sqlPatientHandler('getSqlPatientProfile'));
exports.saveSqlPatientProfile = onCall(sqlPatientCallableOptions, sqlPatientHandler('saveSqlPatientProfile'));
exports.getSqlPatientHealth = onCall(sqlPatientCallableOptions, sqlPatientHandler('getSqlPatientHealth'));
exports.saveSqlPatientHealth = onCall(sqlPatientCallableOptions, sqlPatientHandler('saveSqlPatientHealth'));
exports.listSqlPatientAppointments = onCall(sqlPatientCallableOptions, sqlPatientHandler('listSqlPatientAppointments'));
exports.getSqlPatientAppointment = onCall(sqlPatientCallableOptions, sqlPatientHandler('getSqlPatientAppointment'));
exports.searchSqlStaffPatients = onCall(sqlPatientCallableOptions, sqlPatientHandler('searchSqlStaffPatients'));
exports.getSqlStaffPatientProfile = onCall(sqlPatientCallableOptions, sqlPatientHandler('getSqlStaffPatientProfile'));
exports.saveSqlStaffPatientProfile = onCall(sqlPatientCallableOptions, sqlPatientHandler('saveSqlStaffPatientProfile'));
exports.issueSqlPatientLink = onCall(sqlPatientCallableOptions, sqlPatientHandler('issueSqlPatientLink'));
exports.revokeSqlPatientLink = onCall(sqlPatientCallableOptions, sqlPatientHandler('revokeSqlPatientLink'));
exports.acceptSqlPatientLink = onCall(sqlPatientCallableOptions, sqlPatientHandler('acceptSqlPatientLink'));

// Admin activity viewer over the SQL audit projection; every read writes its
// own audit event, and the unmounted UI keeps it off live staff routes.
exports.listSqlAdminAuditLog = onCall(sqlPatientCallableOptions, request => createSqlAuditLogBackend({ auth: admin.auth(), dc: staffSql() }).listSqlAdminAuditLog(request));

// Staff schedule slice (B011–B013): clinic-day reader and weekly/special-hours
// editors under the same App-Check-enforced options; pages stay unmounted until
// the coordinated release.
exports.listSqlStaffClinicDay = onCall(sqlPatientCallableOptions, request => createSqlClinicDayBackend({ auth: admin.auth(), dc: staffSql() }).listSqlStaffClinicDay(request));
exports.getSqlDoctorWeeklyHours = onCall(sqlPatientCallableOptions, request => createSqlWeeklyHoursBackend({ auth: admin.auth(), dc: staffSql() }).getSqlDoctorWeeklyHours(request));
exports.saveSqlDoctorWeeklyHours = onCall(sqlPatientCallableOptions, request => createSqlWeeklyHoursBackend({ auth: admin.auth(), dc: staffSql() }).saveSqlDoctorWeeklyHours(request));
exports.getSqlDoctorSpecialHours = onCall(sqlPatientCallableOptions, request => createSqlSpecialHoursBackend({ auth: admin.auth(), dc: staffSql() }).getSqlDoctorSpecialHours(request));
exports.saveSqlDoctorSpecialHours = onCall(sqlPatientCallableOptions, request => createSqlSpecialHoursBackend({ auth: admin.auth(), dc: staffSql() }).saveSqlDoctorSpecialHours(request));
