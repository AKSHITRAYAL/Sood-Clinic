const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { istDateKey, toIstParts, weekdayIst } = require('./lib/ist');
const { buildAvailability, makeSlotId } = require('./lib/availability');
const { buildAuthorizationUrl, createEvent, decrypt, encrypt, exchangeAuthorizationCode, freeBusy, refreshAccessToken } = require('./lib/googleCalendar');
const { ROLE, canTransition } = require('./lib/stateMachine');
const { isDoctorId, isEmail, isStaffRole, isStrongTemporaryPassword, normalizeEmail, staffClaims } = require('./lib/staffAccess');
const { canPatientCancel } = require('./lib/appointmentPolicy');

admin.initializeApp();
setGlobalOptions({ region: 'asia-south1', maxInstances: 10 });

const db = admin.firestore();
const GOOGLE_CALENDAR_CLIENT_ID = defineSecret('GOOGLE_CALENDAR_CLIENT_ID');
const GOOGLE_CALENDAR_CLIENT_SECRET = defineSecret('GOOGLE_CALENDAR_CLIENT_SECRET');
const GOOGLE_CALENDAR_TOKEN_KEY = defineSecret('GOOGLE_CALENDAR_TOKEN_KEY');
const app = express();
const allowedOrigins = ['https://sood-clinic.web.app', 'https://sood-clinic.firebaseapp.com', 'http://localhost:5174'];
app.disable('x-powered-by');
app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)) }));
app.use(express.json({ limit: '50kb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});

const fail = (res, status, message) => res.status(status).json({ error: { message } });
const minutes = (time) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return NaN;
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
};
const publicBranch = (doc) => ({ _id: doc.id, name: doc.get('name'), code: doc.get('code'), timezone: doc.get('timezone') || 'Asia/Kolkata' });

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'sood-clinic-api' }));
app.get('/api/v1/public/booking/branches', async (_req, res, next) => {
  try {
    const snapshot = await db.collection('branches').where('active', '==', true).orderBy('name').get();
    res.json({ data: snapshot.docs.map(publicBranch) });
  } catch (error) { next(error); }
});

app.get('/api/v1/public/booking/branches/:branchId/departments', async (req, res, next) => {
  try {
    const snapshot = await db.collection('departments').where('branchId', '==', req.params.branchId).where('active', '==', true).where('publicBookingEnabled', '==', true).orderBy('sortOrder').get();
    res.json({ data: snapshot.docs.map((doc) => ({ _id: doc.id, name: doc.get('name'), description: doc.get('description') || '' })) });
  } catch (error) { next(error); }
});

app.get('/api/v1/public/booking/branches/:branchId/departments/:departmentId/doctors', async (req, res, next) => {
  try {
    const snapshot = await db.collection('doctors').where('branchId', '==', req.params.branchId).where('departmentIds', 'array-contains', req.params.departmentId).where('active', '==', true).where('bookingEnabled', '==', true).get();
    res.json({ data: snapshot.docs.map((doc) => ({ id: doc.id, name: doc.get('name'), qualification: doc.get('qualification') || '', schedule: doc.get('weeklySchedule') || [] })) });
  } catch (error) { next(error); }
});

app.post('/api/v1/public/booking/appointments', async (req, res, next) => {
  try {
    const { branchId, departmentId, doctorId, startsAt, endsAt, patient, reason = '' } = req.body || {};
    if (!branchId || !departmentId || !doctorId || !startsAt || !endsAt || !patient?.name || !patient?.phone) return fail(res, 422, 'Please complete all required booking details.');
    if (!patient.consentToTreatment) return fail(res, 422, 'Consent to treatment is required to book an appointment.');
    const start = new Date(startsAt); const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start || start <= new Date()) return fail(res, 422, 'Choose a future appointment time.');
    const [branch, department, doctor] = await Promise.all([db.collection('branches').doc(branchId).get(), db.collection('departments').doc(departmentId).get(), db.collection('doctors').doc(doctorId).get()]);
    if (!branch.exists || !branch.get('active') || !department.exists || department.get('branchId') !== branchId || !department.get('active') || !department.get('publicBookingEnabled') || !doctor.exists || doctor.get('branchId') !== branchId || !doctor.get('active') || !doctor.get('bookingEnabled') || !(doctor.get('departmentIds') || []).includes(departmentId)) return fail(res, 422, 'The selected clinic service is no longer available.');
    const startParts = toIstParts(start);
    const endParts = toIstParts(end);
    const startMinutes = startParts.hour * 60 + startParts.minute;
    const endMinutes = endParts.hour * 60 + endParts.minute;
    const schedule = (doctor.get('weeklySchedule') || []).find((rule) => rule.weekday === weekdayIst(istDateKey(start)) && minutes(rule.startTime) <= startMinutes && minutes(rule.endTime) >= endMinutes);
    if (!schedule) return fail(res, 422, 'This doctor is not available at the selected time.');
    const appointmentRef = db.collection('appointments').doc();
    const slotRef = db.collection('appointmentSlots').doc(`${doctorId}_${start.toISOString()}`);
    const reference = `SC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await db.runTransaction(async (transaction) => {
      if ((await transaction.get(slotRef)).exists) throw Object.assign(new Error('That appointment time is no longer available.'), { status: 409 });
      transaction.set(slotRef, { doctorId, startsAt: admin.firestore.Timestamp.fromDate(start), appointmentId: appointmentRef.id, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      transaction.set(appointmentRef, { reference, branchId, departmentId, doctorId, startsAt: admin.firestore.Timestamp.fromDate(start), endsAt: admin.firestore.Timestamp.fromDate(end), reason: String(reason).slice(0, 500), status: 'scheduled', source: 'patient_portal', patient: { name: String(patient.name).trim().slice(0, 120), phone: String(patient.phone).trim().slice(0, 30), gender: ['male', 'female', 'other'].includes(patient.gender) ? patient.gender : 'unknown', consentToTreatment: true }, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    });
    res.status(201).json({ data: { appointmentId: appointmentRef.id, reference, status: 'scheduled' } });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => { console.error(error); fail(res, error.status || 500, error.status ? error.message : 'Unable to process this request. Please try again later.'); });
exports.clinicApi = onRequest({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, app);

const requireAdmin = (request) => {
  if (!request.auth || request.auth.token.role !== 'admin') throw new HttpsError('permission-denied', 'Administrator access is required.');
};

const auditStaffAccess = async ({ actorUid, action, targetUid, meta = {} }) => db.collection('auditLogs').add({
  at: admin.firestore.FieldValue.serverTimestamp(),
  actor: { uid: actorUid, role: 'admin' },
  action,
  resource: { type: 'staff_account', id: targetUid },
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
const patientDirectoryRecord = ({ uid, email, profile }) => ({
  uid,
  displayName: profile.displayName,
  displayNameLower: profile.displayName.toLowerCase(),
  email: normalizeEmail(email),
  emailLower: normalizeEmail(email),
  phone: profile.phone || '',
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});
const auditPatientAccess = ({ actorUid, action, targetUid, meta = {} }) => db.collection('auditLogs').add({
  at: admin.firestore.FieldValue.serverTimestamp(), actor: { uid: actorUid, role: 'admin' }, action,
  resource: { type: 'patient', id: targetUid }, meta,
});

exports.syncPatientDirectory = onCall({ region: 'asia-south1', timeoutSeconds: 120, memory: '256MiB' }, async (request) => {
  requireAdmin(request);
  const snapshot = await db.collection('patients').get();
  let batch = db.batch(); let writes = 0; let indexed = 0;
  for (const patient of snapshot.docs) {
    const data = patient.data();
    const email = normalizeEmail(data.email);
    const displayName = trimmed(data.displayName, 160);
    if (!email || !displayName) continue;
    batch.set(db.collection('patientDirectory').doc(patient.id), patientDirectoryRecord({ uid: patient.id, email, profile: { ...data, displayName } }), { merge: true });
    writes += 1; indexed += 1;
    if (writes === 400) { await batch.commit(); batch = db.batch(); writes = 0; }
  }
  if (writes) await batch.commit();
  await auditPatientAccess({ actorUid: request.auth.uid, action: 'patient_directory_synchronised', targetUid: request.auth.uid, meta: { indexed } });
  return { indexed };
});

exports.searchPatients = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  requireAdmin(request);
  const term = trimmed(request.data?.term, 120).toLowerCase();
  if (term.length < 2) throw new HttpsError('invalid-argument', 'Enter at least two characters to search patients.');
  let snapshot;
  if (term.includes('@')) snapshot = await db.collection('patientDirectory').where('emailLower', '==', term).limit(20).get();
  else snapshot = await db.collection('patientDirectory').orderBy('displayNameLower').startAt(term).endAt(`${term}\uf8ff`).limit(20).get();
  return { patients: snapshot.docs.map((item) => ({ uid: item.id, displayName: item.get('displayName'), email: item.get('email'), phone: item.get('phone') || '' })) };
});

exports.getAdminPatientProfile = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  requireAdmin(request);
  const uid = trimmed(request.data?.uid, 128);
  if (!uid) throw new HttpsError('invalid-argument', 'Select a patient first.');
  const snapshot = await db.collection('patients').doc(uid).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Patient record not found.');
  const data = snapshot.data();
  return { uid, profile: Object.fromEntries([...PATIENT_PROFILE_FIELDS, 'email', 'createdAt', 'updatedAt'].map((field) => [field, data[field] || ''])) };
});

exports.updateAdminPatientProfile = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  requireAdmin(request);
  const uid = trimmed(request.data?.uid, 128);
  if (!uid) throw new HttpsError('invalid-argument', 'Select a patient first.');
  const patientRef = db.collection('patients').doc(uid);
  const snapshot = await patientRef.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Patient record not found.');
  const existing = snapshot.data(); const profile = patientProfile(request.data?.profile);
  const email = normalizeEmail(existing.email);
  await patientRef.set({ ...profile, email, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true });
  await db.collection('patientDirectory').doc(uid).set(patientDirectoryRecord({ uid, email, profile }), { merge: true });
  await admin.auth().updateUser(uid, { displayName: `${profile.title ? `${profile.title} ` : ''}${profile.displayName}`.trim() }).catch(() => null);
  await auditPatientAccess({ actorUid: request.auth.uid, action: 'patient_profile_updated', targetUid: uid, meta: { fields: PATIENT_PROFILE_FIELDS.filter((field) => profile[field] !== (existing[field] || '')) } });
  return { message: 'Patient profile updated.' };
});

// Patient-side profile writes also use the trusted boundary. This keeps the
// private directory current while preserving a patient’s right to manage only
// their own information.
exports.registerPatientProfile = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  if (!request.auth || isStaffRole(request.auth.token.role)) throw new HttpsError('permission-denied', 'Patient sign-in is required.');
  const user = await admin.auth().getUser(request.auth.uid);
  const displayName = trimmed(request.data?.displayName, 160);
  if (!displayName || !isEmail(user.email)) throw new HttpsError('invalid-argument', 'A patient name and verified email are required.');
  const patientRef = db.collection('patients').doc(user.uid);
  const prior = await patientRef.get();
  const profile = { ...patientProfile({ displayName, ...(prior.exists ? prior.data() : {}) }), displayName };
  await patientRef.set({ ...profile, email: normalizeEmail(user.email), createdAt: prior.exists ? prior.get('createdAt') : new Date().toISOString(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await db.collection('patientDirectory').doc(user.uid).set(patientDirectoryRecord({ uid: user.uid, email: user.email, profile }), { merge: true });
  return { message: 'Patient profile created.' };
});

exports.updateOwnPatientProfile = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  if (!request.auth || isStaffRole(request.auth.token.role)) throw new HttpsError('permission-denied', 'Patient sign-in is required.');
  const user = await admin.auth().getUser(request.auth.uid);
  const patientRef = db.collection('patients').doc(user.uid); const prior = await patientRef.get();
  const profile = patientProfile(request.data?.profile);
  await patientRef.set({ ...profile, email: normalizeEmail(user.email), createdAt: prior.exists ? prior.get('createdAt') : new Date().toISOString(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await db.collection('patientDirectory').doc(user.uid).set(patientDirectoryRecord({ uid: user.uid, email: user.email, profile }), { merge: true });
  await admin.auth().updateUser(user.uid, { displayName: `${profile.title ? `${profile.title} ` : ''}${profile.displayName}`.trim() });
  return { message: 'Your profile has been saved.' };
});

// Privileged staff lifecycle operations. This endpoint is deliberately callable only by
// Firebase users carrying the trusted admin custom claim; the browser never sets roles.
exports.manageStaffAccount = onCall({ region: 'asia-south1', enforceAppCheck: false }, async (request) => {
  requireAdmin(request);
  const { action, email, password, displayName = '', role, doctorId, disabled } = request.data || {};
  const normalizedEmail = normalizeEmail(email);
  if (!isEmail(normalizedEmail)) throw new HttpsError('invalid-argument', 'Enter a valid staff email address.');
  if (action === 'provision') {
    if (!isStaffRole(role) || !isStrongTemporaryPassword(password) || !String(displayName).trim()) throw new HttpsError('invalid-argument', 'Enter a name, valid role, and a temporary password with at least 12 characters including letters and numbers.');
    if (role === 'doctor' && !isDoctorId(doctorId)) throw new HttpsError('invalid-argument', 'Enter a stable doctor ID using letters, numbers, hyphens, or underscores.');
    let user;
    try {
      user = await admin.auth().getUserByEmail(normalizedEmail);
      const existingProfile = await db.collection('staffProfiles').doc(user.uid).get();
      if (!existingProfile.exists && !isStaffRole(user.customClaims?.role)) throw new HttpsError('already-exists', 'This email already belongs to an account. Do not convert an existing account into staff access from this screen.');
      await admin.auth().updateUser(user.uid, { displayName: String(displayName).trim(), password: String(password), disabled: false });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      if (error.code !== 'auth/user-not-found') throw error;
      user = await admin.auth().createUser({ email: normalizedEmail, password: String(password), displayName: String(displayName).trim(), disabled: false });
    }
    const claims = staffClaims({ existingClaims: user.customClaims, role, doctorId, forcePasswordChange: true });
    await admin.auth().setCustomUserClaims(user.uid, claims);
    await admin.auth().revokeRefreshTokens(user.uid);
    await db.collection('staffProfiles').doc(user.uid).set({ uid: user.uid, email: normalizedEmail, name: String(displayName).trim(), role, doctorId: role === 'doctor' ? doctorId : null, active: true, requiresPasswordChange: true, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid, createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
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
    await db.collection('staffProfiles').doc(user.uid).set({ uid: user.uid, email: normalizedEmail, name: String(displayName).trim(), role, doctorId: role === 'doctor' ? doctorId : null, active: !user.disabled, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true });
    await auditStaffAccess({ actorUid: request.auth.uid, action: 'staff_access_updated', targetUid: user.uid, meta: { role, doctorId: role === 'doctor' ? doctorId : null } });
    return { message: 'Staff access updated and active sessions were revoked.' };
  }
  if (action === 'temporaryPassword') {
    if (!isStrongTemporaryPassword(password)) throw new HttpsError('invalid-argument', 'Temporary password must have at least 12 characters including letters and numbers.');
    await admin.auth().updateUser(user.uid, { password: String(password) });
    await admin.auth().setCustomUserClaims(user.uid, { ...user.customClaims, forcePasswordChange: true });
    await admin.auth().revokeRefreshTokens(user.uid);
    await db.collection('staffProfiles').doc(user.uid).set({ requiresPasswordChange: true, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true });
    await auditStaffAccess({ actorUid: request.auth.uid, action: 'staff_temporary_password_set', targetUid: user.uid });
    return { message: 'Temporary password set. Existing sessions were revoked; share it through a secure channel.' };
  }
  if (action === 'disable') {
    const nextDisabled = Boolean(disabled);
    await preventSelfOrLastAdminLockout({ actorUid: request.auth.uid, target: user, nextRole: user.customClaims?.role, nextDisabled });
    await admin.auth().updateUser(user.uid, { disabled: nextDisabled });
    await admin.auth().revokeRefreshTokens(user.uid);
    await db.collection('staffProfiles').doc(user.uid).set({ active: !Boolean(disabled), updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true });
    await auditStaffAccess({ actorUid: request.auth.uid, action: nextDisabled ? 'staff_suspended' : 'staff_restored', targetUid: user.uid });
    return { message: nextDisabled ? 'Staff account suspended and active sessions were revoked.' : 'Staff account restored.' };
  }
  if (action === 'revokeSessions') {
    if (user.uid === request.auth.uid) throw new HttpsError('failed-precondition', 'Use the sign-out control for your own session.');
    await admin.auth().revokeRefreshTokens(user.uid);
    await auditStaffAccess({ actorUid: request.auth.uid, action: 'staff_sessions_revoked', targetUid: user.uid });
    return { message: 'Active refresh sessions were revoked. Existing ID tokens expire within one hour.' };
  }
  if (action === 'completeMandatoryPasswordChange') {
    if (user.uid !== request.auth.uid) throw new HttpsError('permission-denied', 'You can only complete your own password change.');
    await admin.auth().setCustomUserClaims(user.uid, { ...user.customClaims, forcePasswordChange: false });
    await db.collection('staffProfiles').doc(user.uid).set({ requiresPasswordChange: false, passwordChangedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true });
    await auditStaffAccess({ actorUid: request.auth.uid, action: 'staff_mandatory_password_change_completed', targetUid: user.uid });
    return { message: 'Password requirement cleared.' };
  }
  throw new HttpsError('invalid-argument', 'Unsupported staff account action.');
});

// Imports only accounts that already carry a trusted staff custom claim. It never
// grants a role and exists to migrate the original command-created staff accounts
// into the protected directory before stricter lifecycle enforcement is enabled.
exports.syncManagedStaffDirectory = onCall({ region: 'asia-south1' }, async (request) => {
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
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
exports.getBookingCatalog = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async () => {
  const [branchSnapshot, departmentSnapshot, doctorSnapshot, configSnapshot] = await Promise.all([
    db.collection('branches').get(),
    db.collection('departments').get(),
    db.collection('doctors').get(),
    db.collection('clinic').doc('publicConfig').get(),
  ]);
  const departments = departmentSnapshot.docs.filter((item) => item.get('active') === true && item.get('publicBookingEnabled') === true).map((item) => ({
    id: item.id, branchId: item.get('branchId'), name: trimmed(item.get('name'), 120), description: trimmed(item.get('description'), 300), sortOrder: Number(item.get('sortOrder')) || 0,
  }));
  const doctors = doctorSnapshot.docs.filter((item) => item.get('active') === true && item.get('bookingEnabled') === true).map((item) => ({
    id: item.id, branchId: item.get('branchId'), departmentIds: Array.isArray(item.get('departmentIds')) ? item.get('departmentIds') : [], name: trimmed(item.get('name'), 160), qualification: trimmed(item.get('qualification'), 160),
  }));
  const branches = branchSnapshot.docs.filter((item) => item.get('active') === true).map((item) => ({ id: item.id, name: trimmed(item.get('name'), 120), timezone: item.get('timezone') || 'Asia/Kolkata' }));
  const config = bookingConfig(configSnapshot);
  return { branches, departments, doctors, booking: { bookingWindowDays: config.bookingWindowDays, visitTypes: config.visitTypes.length ? config.visitTypes.map((item) => ({ id: trimmed(item.id, 60), label: trimmed(item.label, 100), minutes: item.minutes })) : [{ id: 'consultation', label: 'Consultation', minutes: config.slotMinutes }] } };
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

const asDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const publicError = (code, message) => new HttpsError(code, message);
const roleFor = (authContext) => authContext?.token?.role || 'patient';
const trimmed = (value, max) => String(value || '').trim().slice(0, max);
const validPhone = (value) => /^\+?[0-9][0-9\s-]{6,18}$/.test(String(value || '').trim());
const validClientRequestId = (value) => /^[a-zA-Z0-9_-]{16,128}$/.test(String(value || ''));
const isActiveAppointment = (status) => !['cancelled', 'completed', 'no_show'].includes(status);
const appointmentReference = () => `SC-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
const functionsProject = () => process.env.GCLOUD_PROJECT || 'sood-clinic';
const googleCallbackUrl = () => `https://asia-south1-${functionsProject()}.cloudfunctions.net/googleCalendarCallback`;

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
    visitTypes: Array.isArray(configured.visitTypes) ? configured.visitTypes : [],
  };
};

const visitTypeFor = (config, visitTypeId) => {
  const visitType = config.visitTypes.find((item) => item && item.id === visitTypeId);
  if (visitType && Number.isInteger(visitType.minutes) && visitType.minutes >= 5 && visitType.minutes <= 240) return visitType;
  if (visitTypeId && visitTypeId !== 'consultation') throw publicError('invalid-argument', 'The selected visit type is unavailable.');
  return { id: 'consultation', label: 'Consultation', minutes: config.slotMinutes };
};

const slotBusyRanges = async (doctorId, dateKey) => {
  const snapshot = await db.collection('appointmentSlots').where('doctorId', '==', doctorId).get();
  return snapshot.docs.map((item) => item.data()).filter((item) => {
    const legacyDateKey = asDate(item.startsAt) ? istDateKey(asDate(item.startsAt)) : null;
    return (item.dateKey || legacyDateKey) === dateKey && ['booked', 'blocked', 'held'].includes(item.status);
  })
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
    await connection.ref.set({ syncStatus: 'healthy', lastAvailabilitySyncAt: admin.firestore.FieldValue.serverTimestamp(), lastSyncError: admin.firestore.FieldValue.delete() }, { merge: true });
    return { ranges, calendar: { connected: true, status: 'healthy' } };
  } catch (_error) {
    // Do not reveal provider detail or fail the clinic's own booking system if
    // Google is temporarily unavailable. The server records only a safe status.
    await connection.ref.set({ syncStatus: 'degraded', lastSyncError: 'Unable to refresh external calendar availability.', lastSyncErrorAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return { ranges: [], calendar: { connected: true, status: 'degraded' } };
  }
};

const availabilityContext = async ({ doctorId, dateKey, visitTypeId }) => {
  const [doctorSnapshot, scheduleSnapshot, exceptionSnapshot, configSnapshot] = await Promise.all([
    db.collection('doctors').doc(doctorId).get(),
    db.collection('doctorSchedules').doc(doctorId).get(),
    db.collection('scheduleExceptions').doc(`${doctorId}_${dateKey}`).get(),
    db.collection('clinic').doc('publicConfig').get(),
  ]);
  if (!doctorSnapshot.exists || doctorSnapshot.get('active') !== true || doctorSnapshot.get('bookingEnabled') !== true) throw publicError('not-found', 'This doctor is not currently available for online bookings.');
  const config = bookingConfig(configSnapshot);
  const visitType = visitTypeFor(config, visitTypeId);
  const [slots, external] = await Promise.all([slotBusyRanges(doctorId, dateKey), externalBusyRanges({ doctorId, dateKey })]);
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
    busyRanges: [...slots, ...external.ranges],
    externalCalendar: external.calendar,
  };
};

exports.getAvailability = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB', secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_KEY] }, async (request) => {
  const { doctorId, dateKey, visitTypeId } = request.data || {};
  if (!doctorId || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) throw publicError('invalid-argument', 'Choose a doctor and appointment date.');
  const context = await availabilityContext({ doctorId, dateKey, visitTypeId });
  const slots = buildAvailability({ doctorId, dateKey, weeklySessions: context.weeklySessions, exception: context.exception, durationMinutes: context.visitType.minutes, intervalMinutes: context.config.intervalMinutes, bufferBeforeMinutes: context.config.bufferBeforeMinutes, bufferAfterMinutes: context.config.bufferAfterMinutes, leadMinutes: context.config.leadMinutes, bookingWindowDays: context.config.bookingWindowDays, busyRanges: context.busyRanges });
  return { timezone: context.config.timezone, visitType: { id: context.visitType.id, label: context.visitType.label, minutes: context.visitType.minutes }, calendar: context.externalCalendar, slots: slots.map((slot) => ({ slotId: slot.slotId, startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString(), time: slot.time })) };
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
    await appointmentRef.set({ externalCalendar: { provider: 'google', calendarId, eventId: event.id, syncStatus: 'synced', lastSyncedAt: admin.firestore.FieldValue.serverTimestamp() }, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  } catch (_error) {
    await appointmentRef.set({ externalCalendar: { provider: 'google', syncStatus: 'pending', lastSyncError: 'Calendar event could not be synced.' }, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }
};

exports.createBooking = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB', secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_KEY] }, async (request) => {
  const { branchId, departmentId, doctorId, dateKey, time, visitTypeId, patient, reason, consentVersion, clientRequestId } = request.data || {};
  if (!branchId || !departmentId || !doctorId || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || '')) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || ''))) throw publicError('invalid-argument', 'Choose a valid appointment time.');
  if (!validClientRequestId(clientRequestId)) throw publicError('invalid-argument', 'Please refresh and try booking again.');
  const name = trimmed(patient?.name, 120);
  const phone = trimmed(patient?.phone, 30);
  if (!name || !validPhone(phone) || patient?.consentToTreatment !== true) throw publicError('invalid-argument', 'Enter your name, a valid phone number, and consent to the appointment terms.');
  const context = await availabilityContext({ doctorId, dateKey, visitTypeId });
  const appointmentSlots = buildAvailability({ doctorId, dateKey, weeklySessions: context.weeklySessions, exception: context.exception, durationMinutes: context.visitType.minutes, intervalMinutes: context.config.intervalMinutes, bufferBeforeMinutes: context.config.bufferBeforeMinutes, bufferAfterMinutes: context.config.bufferAfterMinutes, leadMinutes: context.config.leadMinutes, bookingWindowDays: context.config.bookingWindowDays, busyRanges: context.busyRanges });
  const requested = appointmentSlots.find((slot) => slot.time === time);
  if (!requested) throw publicError('failed-precondition', 'That time is no longer available. Please choose another slot.');
  const [branchSnapshot, departmentSnapshot, doctorSnapshot] = await Promise.all([db.collection('branches').doc(branchId).get(), db.collection('departments').doc(departmentId).get(), db.collection('doctors').doc(doctorId).get()]);
  if (!branchSnapshot.exists || branchSnapshot.get('active') !== true || !departmentSnapshot.exists || departmentSnapshot.get('branchId') !== branchId || departmentSnapshot.get('active') !== true || departmentSnapshot.get('publicBookingEnabled') !== true || !doctorSnapshot.exists || doctorSnapshot.get('branchId') !== branchId || !(doctorSnapshot.get('departmentIds') || []).includes(departmentId)) throw publicError('failed-precondition', 'The selected clinic service is not available.');

  const requestRef = db.collection('bookingRequests').doc(clientRequestId);
  const appointmentRef = db.collection('appointments').doc();
  const slotRef = db.collection('appointmentSlots').doc(makeSlotId(doctorId, dateKey, time));
  const reference = appointmentReference();
  const role = roleFor(request.auth);
  let result;
  try {
    await db.runTransaction(async (transaction) => {
      const [prior, slot] = await Promise.all([transaction.get(requestRef), transaction.get(slotRef)]);
      if (prior.exists) {
        result = { appointmentId: prior.get('appointmentId'), reference: prior.get('reference'), status: prior.get('status'), idempotent: true };
        return;
      }
      if (slot.exists) throw publicError('already-exists', 'That time has just been booked. Please choose another slot.');
      const status = context.config.autoConfirm ? 'confirmed' : 'scheduled';
      const createdBy = request.auth ? { uid: request.auth.uid, role } : { uid: null, role: 'public' };
      transaction.set(slotRef, { doctorId, dateKey, startsAt: admin.firestore.Timestamp.fromDate(requested.startsAt), endsAt: admin.firestore.Timestamp.fromDate(requested.endsAt), appointmentId: appointmentRef.id, status: 'booked', createdAt: admin.firestore.FieldValue.serverTimestamp() });
      transaction.set(appointmentRef, {
        reference, branchId, departmentId, doctorId, visitType: context.visitType.id, dateKey,
        startsAt: admin.firestore.Timestamp.fromDate(requested.startsAt), endsAt: admin.firestore.Timestamp.fromDate(requested.endsAt),
        status, source: request.auth ? 'patient_portal' : 'web', patientId: request.auth?.uid || null,
        patientSnapshot: { name, phone }, reason: trimmed(reason, 500) || null, slotIds: [slotRef.id],
        consent: { version: trimmed(consentVersion, 40) || 'booking-v1', acceptedAt: admin.firestore.FieldValue.serverTimestamp() },
        createdBy, externalCalendar: { provider: 'google', syncStatus: 'not_connected' }, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      transaction.set(appointmentRef.collection('events').doc(), { from: null, to: status, byUid: createdBy.uid, byRole: createdBy.role, at: admin.firestore.FieldValue.serverTimestamp(), meta: { source: request.auth ? 'patient_portal' : 'web' } });
      transaction.set(db.collection('auditLogs').doc(), { at: admin.firestore.FieldValue.serverTimestamp(), actor: createdBy, action: 'appointment_created', resource: { type: 'appointment', id: appointmentRef.id }, meta: { source: request.auth ? 'patient_portal' : 'web', status } });
      transaction.set(requestRef, { appointmentId: appointmentRef.id, reference, status, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      result = { appointmentId: appointmentRef.id, reference, status, idempotent: false };
    });
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    throw publicError('internal', 'We could not reserve this time. Please try again.');
  }
  if (!result.idempotent) await syncAppointmentToGoogle(result.appointmentId);
  return result;
});

// All appointment lifecycle changes happen on the trusted server. Browser clients
// may read appointments, but Firestore rules intentionally deny direct writes.
exports.transitionAppointment = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const role = ROLE[request.auth?.token?.role];
  if (!role) throw publicError('permission-denied', 'Staff access is required.');
  const { appointmentId, to, reason } = request.data || {};
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(String(appointmentId || '')) || !/^[a-z_]{2,40}$/.test(String(to || ''))) throw publicError('invalid-argument', 'Invalid appointment update.');
  const cancellationReason = trimmed(reason, 300);
  if (to === 'cancelled' && !cancellationReason) throw publicError('invalid-argument', 'A cancellation reason is required.');
  const ref = db.collection('appointments').doc(appointmentId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw publicError('not-found', 'Appointment not found.');
    const appointment = snapshot.data();
    if (role === 'doctor' && appointment.doctorId !== request.auth.token.doctorId) throw publicError('permission-denied', 'You can only update your own appointments.');
    if (!canTransition(appointment.status, to, role)) throw publicError('failed-precondition', 'That appointment change is not allowed.');
    const now = admin.firestore.FieldValue.serverTimestamp();
    const update = { status: to, updatedAt: now };
    if (to === 'cancelled') update.cancellation = { byUid: request.auth.uid, byRole: role, reason: cancellationReason, at: now };
    transaction.update(ref, update);
    if (to === 'cancelled') {
      const slotIds = Array.isArray(appointment.slotIds) && appointment.slotIds.length ? appointment.slotIds : (appointment.slotId ? [appointment.slotId] : []);
      slotIds.forEach((slotId) => transaction.delete(db.collection('appointmentSlots').doc(slotId)));
    }
    transaction.set(ref.collection('events').doc(), { from: appointment.status, to, byUid: request.auth.uid, byRole: role, at: now, reason: to === 'cancelled' ? cancellationReason : null });
    transaction.set(db.collection('auditLogs').doc(), { at: now, actor: { uid: request.auth.uid, role }, action: `appointment_${to}`, resource: { type: 'appointment', id: ref.id } });
  });
  return { ok: true, status: to };
});

// Patients can release their own future slot before the configured cutoff. The
// appointment, slot release, event, and audit record are one transaction.
exports.cancelPatientAppointment = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  if (!request.auth || isStaffRole(request.auth.token.role)) throw publicError('permission-denied', 'Sign in to cancel your appointment.');
  const appointmentId = trimmed(request.data?.appointmentId, 200);
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(appointmentId)) throw publicError('invalid-argument', 'Invalid appointment.');
  const reason = trimmed(request.data?.reason, 300) || 'Cancelled by patient';
  const config = bookingConfig(await db.collection('clinic').doc('publicConfig').get());
  const ref = db.collection('appointments').doc(appointmentId);
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) throw publicError('not-found', 'Appointment not found.');
    const appointment = snapshot.data();
    if (!canPatientCancel({ appointment, uid: request.auth.uid, cutoffHours: config.patientCancellationCutoffHours })) throw publicError('failed-precondition', 'This appointment can no longer be cancelled online. Please contact the clinic.');
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.update(ref, { status: 'cancelled', cancellation: { byUid: request.auth.uid, byRole: 'patient', reason, at: now }, updatedAt: now });
    const slotIds = Array.isArray(appointment.slotIds) && appointment.slotIds.length ? appointment.slotIds : (appointment.slotId ? [appointment.slotId] : []);
    slotIds.forEach((slotId) => transaction.delete(db.collection('appointmentSlots').doc(slotId)));
    transaction.set(ref.collection('events').doc(), { from: appointment.status, to: 'cancelled', byUid: request.auth.uid, byRole: 'patient', reason, at: now });
    transaction.set(db.collection('auditLogs').doc(), { at: now, actor: { uid: request.auth.uid, role: 'patient' }, action: 'appointment_cancelled', resource: { type: 'appointment', id: ref.id }, meta: { source: 'patient_portal' } });
  });
  return { ok: true, status: 'cancelled' };
});

// --- Google Calendar connection -------------------------------------------
// This is clinic-admin initiated only. Browser code receives an OAuth URL but
// never receives a client secret, refresh token, or another calendar's events.
exports.beginGoogleCalendarConnection = onCall({ region: 'asia-south1', secrets: [GOOGLE_CALENDAR_CLIENT_ID] }, async (request) => {
  requireAdmin(request);
  const { doctorId = 'brig-ak-sood', calendarId = 'primary' } = request.data || {};
  if (!doctorId || !/^[A-Za-z0-9_-]{1,120}$/.test(String(doctorId)) || !/^[A-Za-z0-9@._-]{1,240}$/.test(String(calendarId))) throw publicError('invalid-argument', 'Choose a valid doctor and Google Calendar.');
  const state = crypto.randomBytes(32).toString('base64url');
  await db.collection('integrationOAuthStates').doc(state).set({ doctorId, calendarId, requestedBy: request.auth.uid, expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 10 * 60 * 1000)), createdAt: admin.firestore.FieldValue.serverTimestamp() });
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
    await db.collection('integrations').doc('googleCalendar').set({ provider: 'google', doctorId: stateSnapshot.get('doctorId'), calendarId: stateSnapshot.get('calendarId'), active: true, encryptedRefreshToken: encrypt(token.refresh_token, GOOGLE_CALENDAR_TOKEN_KEY.value()), connectedBy: stateSnapshot.get('requestedBy'), connectedAt: admin.firestore.FieldValue.serverTimestamp(), syncStatus: 'healthy', lastSyncError: admin.firestore.FieldValue.delete() }, { merge: true });
    await stateRef.delete();
    return res.status(200).type('html').send('<!doctype html><title>Calendar connected</title><p>Google Calendar is connected. You may close this window and return to the staff portal.</p>');
  } catch (_error) {
    return res.status(400).type('html').send('<!doctype html><title>Calendar connection failed</title><p>The Google Calendar connection could not be completed. Please return to the staff portal and try again.</p>');
  }
});

exports.googleCalendarStatus = onCall({ region: 'asia-south1' }, async (request) => {
  requireAdmin(request);
  const snapshot = await db.collection('integrations').doc('googleCalendar').get();
  if (!snapshot.exists) return { connected: false };
  const value = snapshot.data();
  return { connected: value.active === true, doctorId: value.doctorId, calendarId: value.calendarId, syncStatus: value.syncStatus || 'unknown', lastSyncError: value.lastSyncError || null };
});

exports.disconnectGoogleCalendar = onCall({ region: 'asia-south1' }, async (request) => {
  requireAdmin(request);
  await db.collection('integrations').doc('googleCalendar').set({ active: false, disconnectedAt: admin.firestore.FieldValue.serverTimestamp(), disconnectedBy: request.auth.uid, syncStatus: 'disconnected' }, { merge: true });
  return { disconnected: true };
});
