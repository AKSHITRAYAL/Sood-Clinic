const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { istDateKey, toIstParts, weekdayIst } = require('./lib/ist');
const { buildAvailability, makeSlotId } = require('./lib/availability');
const { buildAuthorizationUrl, createEvent, decrypt, encrypt, exchangeAuthorizationCode, freeBusy, refreshAccessToken, updateEventTime } = require('./lib/googleCalendar');
const { ROLE, canTransition } = require('./lib/stateMachine');
const { isDoctorId, isEmail, isStaffRole, isStrongTemporaryPassword, normalizeEmail, staffClaims } = require('./lib/staffAccess');
const { canPatientCancel } = require('./lib/appointmentPolicy');
const { formatUhid, isUhid, normalizePatientName, normalizePhone } = require('./lib/patientRegistry');

admin.initializeApp();
setGlobalOptions({ region: 'asia-south1', maxInstances: 10 });

const db = admin.firestore();
const GOOGLE_CALENDAR_CLIENT_ID = defineSecret('GOOGLE_CALENDAR_CLIENT_ID');
const GOOGLE_CALENDAR_CLIENT_SECRET = defineSecret('GOOGLE_CALENDAR_CLIENT_SECRET');
const GOOGLE_CALENDAR_TOKEN_KEY = defineSecret('GOOGLE_CALENDAR_TOKEN_KEY');
const requireAdmin = (request) => {
  if (!request.auth || request.auth.token.role !== 'admin') throw new HttpsError('permission-denied', 'Administrator access is required.');
};

const requireRegistrationStaff = (request) => {
  const role = request.auth?.token?.role;
  if (!request.auth || !['admin', 'receptionist'].includes(role)) throw new HttpsError('permission-denied', 'Reception or administrator access is required.');
  return role;
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
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
});
const auditPatientAccess = ({ actorUid, actorRole = 'admin', action, targetUid, meta = {} }) => db.collection('auditLogs').add({
  at: admin.firestore.FieldValue.serverTimestamp(), actor: { uid: actorUid, role: actorRole }, action,
  resource: { type: 'patient', id: targetUid }, meta,
});

const allocateUhid = async (transaction) => {
  const counterRef = db.collection('counters').doc('patientUhid');
  const counter = await transaction.get(counterRef);
  const current = Number(counter.get('value')) || 0;
  if (!Number.isInteger(current) || current < 0) throw new HttpsError('failed-precondition', 'The patient ID registry requires administrator review.');
  const next = current + 1;
  transaction.set(counterRef, { value: next, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  return formatUhid(next);
};

const patientIdentityLockId = ({ displayName, phone }) => crypto.createHash('sha256')
  .update(`${normalizePatientName(displayName)}\u0000${normalizePhone(phone)}`)
  .digest('hex');

exports.syncPatientDirectory = onCall({ region: 'asia-south1', timeoutSeconds: 120, memory: '256MiB' }, async (request) => {
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

exports.searchPatients = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  requireRegistrationStaff(request);
  const rawTerm = trimmed(request.data?.term, 120);
  const term = rawTerm.toLowerCase();
  const phone = normalizePhone(rawTerm);
  if (term.length < 2) throw new HttpsError('invalid-argument', 'Enter at least two characters to search patients.');
  let snapshot;
  if (isUhid(rawTerm)) snapshot = await db.collection('patientDirectory').where('uhid', '==', rawTerm.toUpperCase()).limit(1).get();
  else if (term.includes('@')) snapshot = await db.collection('patientDirectory').where('emailLower', '==', term).limit(20).get();
  else if (phone) snapshot = await db.collection('patientDirectory').where('phoneNormalized', '==', phone).limit(20).get();
  else snapshot = await db.collection('patientDirectory').orderBy('displayNameLower').startAt(term).endAt(`${term}\uf8ff`).limit(20).get();
  return { patients: snapshot.docs.map((item) => ({
    uid: item.get('uid') || item.id,
    patientId: item.get('patientId') || item.id,
    uhid: item.get('uhid') || '',
    displayName: item.get('displayName'),
    email: item.get('email'),
    phone: item.get('phone') || '',
  })) };
});

exports.getAdminPatientProfile = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  requireAdmin(request);
  const uid = trimmed(request.data?.uid, 128);
  if (!uid) throw new HttpsError('invalid-argument', 'Select a patient first.');
  const snapshot = await db.collection('patients').doc(uid).get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Patient record not found.');
  const data = snapshot.data();
  return {
    uid,
    patientId: uid,
    uhid: data.uhid || '',
    linkedUids: Array.isArray(data.linkedUids) ? data.linkedUids : [uid],
    profile: Object.fromEntries([...PATIENT_PROFILE_FIELDS, 'email', 'createdAt', 'updatedAt'].map((field) => [field, data[field] || ''])),
  };
});

exports.updateAdminPatientProfile = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
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
      updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid,
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
exports.registerPatientProfile = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  if (!request.auth || isStaffRole(request.auth.token.role)) throw new HttpsError('permission-denied', 'Patient sign-in is required.');
  const user = await admin.auth().getUser(request.auth.uid);
  const displayName = trimmed(request.data?.displayName, 160);
  if (!displayName || !isEmail(user.email)) throw new HttpsError('invalid-argument', 'A patient name and verified email are required.');
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
      createdAt: prior.exists ? priorData.createdAt || admin.firestore.FieldValue.serverTimestamp() : admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(db.collection('patientDirectory').doc(user.uid), patientDirectoryRecord({ patientId: user.uid, uid: user.uid, email: user.email, profile, uhid, linkedUids }), { merge: true });
  });
  return { message: 'Patient profile created.', uhid };
});

exports.updateOwnPatientProfile = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  if (!request.auth || isStaffRole(request.auth.token.role)) throw new HttpsError('permission-denied', 'Patient sign-in is required.');
  const user = await admin.auth().getUser(request.auth.uid);
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
      createdAt: prior.exists ? priorData.createdAt || admin.firestore.FieldValue.serverTimestamp() : admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(db.collection('patientDirectory').doc(user.uid), patientDirectoryRecord({ patientId: user.uid, uid: user.uid, email: user.email, profile, uhid, linkedUids }), { merge: true });
  });
  await admin.auth().updateUser(user.uid, { displayName: `${profile.title ? `${profile.title} ` : ''}${profile.displayName}`.trim() });
  return { message: 'Your profile has been saved.', uhid };
});

// Staff registration deliberately creates a clinical record only. Linking it to
// a future patient login is a separate, verified workflow so a receptionist can
// never take over an existing Firebase account by entering an email address.
exports.registerPatient = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
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
      const now = admin.firestore.FieldValue.serverTimestamp();
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
  return { branches, departments, doctors, booking: { bookingWindowDays: config.bookingWindowDays, visitTypes: config.visitTypes.filter((item) => item.active).map((item) => ({ id: item.id, label: item.label, minutes: item.minutes, mode: item.mode })) } };
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
exports.getAdminBookingCatalog = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
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

exports.manageBookingCatalog = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  requireAdmin(request);
  const { action, record = {} } = request.data || {};
  if (action === 'branch') {
    const id = catalogId(record.id, 'Branch ID');
    const payload = { name: catalogText(record.name, 'Branch name', 120), code: catalogText(record.code, 'Branch code', 40), timezone: 'Asia/Kolkata', active: record.active === true, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid };
    await db.collection('branches').doc(id).set(payload, { merge: true });
    await auditStaffAccess({ actorUid: request.auth.uid, action: 'booking_catalog_branch_saved', targetUid: id, meta: { active: payload.active } });
    return { message: 'Branch saved.' };
  }
  if (action === 'department') {
    const id = catalogId(record.id, 'Department ID'); const branchId = catalogId(record.branchId, 'Branch ID');
    if (!(await db.collection('branches').doc(branchId).get()).exists) throw new HttpsError('failed-precondition', 'Choose an existing branch.');
    const sortOrder = Number(record.sortOrder);
    if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) throw new HttpsError('invalid-argument', 'Sort order must be a whole number between 0 and 9999.');
    const payload = { branchId, name: catalogText(record.name, 'Department name', 120), description: catalogText(record.description, 'Description', 300, false), active: record.active === true, publicBookingEnabled: record.publicBookingEnabled === true, sortOrder, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid };
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
    const payload = { branchId, departmentIds, name: catalogText(record.name, 'Doctor name', 160), qualification: catalogText(record.qualification, 'Qualification', 160, false), active: record.active === true, bookingEnabled: record.bookingEnabled === true, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid };
    await db.collection('doctors').doc(id).set(payload, { merge: true });
    await auditStaffAccess({ actorUid: request.auth.uid, action: 'booking_catalog_doctor_saved', targetUid: id, meta: { branchId, active: payload.active, bookingEnabled: payload.bookingEnabled } });
    return { message: 'Doctor saved.' };
  }
  throw new HttpsError('invalid-argument', 'Unsupported catalogue action.');
});

// Visit formats are configuration rather than a client-side convention. This
// keeps the public selector, appointment record and staff video workflow on one
// server-validated contract, and makes a future data-store migration explicit.
exports.getAdminBookingConfiguration = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  requireAdmin(request);
  const config = bookingConfig(await db.collection('clinic').doc('publicConfig').get());
  return { visitTypes: config.visitTypes };
});

exports.saveBookingVisitTypes = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  requireAdmin(request);
  const visitTypes = normaliseVisitTypes(request.data?.visitTypes, { requireAtLeastOne: true });
  await db.collection('clinic').doc('publicConfig').set({ visitTypes, updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid }, { merge: true });
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
exports.getAuditLog = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
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
      resourceType: trimmed(data.resource?.type, 80) || 'system',
    };
  });
  return { events };
});

// Experience feedback is never public by default. A patient may submit one
// review only after a completed appointment; an administrator must explicitly
// publish it before the public site can receive its minimal projection.
exports.submitPatientFeedback = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
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
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(feedbackRef, { appointmentId, patientId: request.auth.uid, rating, comment, status: 'pending', createdAt: now, updatedAt: now });
    transaction.set(db.collection('auditLogs').doc(), { at: now, actor: { uid: request.auth.uid, role: 'patient' }, action: 'patient_feedback_submitted', resource: { type: 'patient_feedback', id: feedbackRef.id }, meta: { rating } });
  });
  return { message: 'Thank you. Your feedback has been submitted for review.' };
});

exports.getPublicTestimonials = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async () => {
  const snapshot = await db.collection('patientFeedback').where('status', '==', 'published').orderBy('publishedAt', 'desc').limit(6).get();
  return { testimonials: snapshot.docs.map((item) => ({ id: item.id, rating: item.get('rating'), comment: item.get('comment') })) };
});

exports.getFeedbackModerationQueue = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  requireAdmin(request);
  const snapshot = await db.collection('patientFeedback').where('status', '==', 'pending').orderBy('createdAt', 'desc').limit(30).get();
  return { feedback: snapshot.docs.map((item) => ({ id: item.id, appointmentId: item.get('appointmentId'), rating: item.get('rating'), comment: item.get('comment') })) };
});

exports.moderatePatientFeedback = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  requireAdmin(request);
  const feedbackId = String(request.data?.feedbackId || '').trim();
  const action = String(request.data?.action || '').trim();
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(feedbackId) || !['publish', 'reject', 'unpublish'].includes(action)) throw new HttpsError('invalid-argument', 'Choose a valid feedback moderation action.');
  const ref = db.collection('patientFeedback').doc(feedbackId);
  const snapshot = await ref.get();
  if (!snapshot.exists) throw new HttpsError('not-found', 'Feedback was not found.');
  const status = action === 'publish' ? 'published' : action === 'reject' ? 'rejected' : 'unpublished';
  await ref.set({ status, reviewedAt: admin.firestore.FieldValue.serverTimestamp(), reviewedBy: request.auth.uid, publishedAt: action === 'publish' ? admin.firestore.FieldValue.serverTimestamp() : admin.firestore.FieldValue.delete() }, { merge: true });
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
  const exceptionRef = db.collection('scheduleExceptions').doc(`${doctorId}_${dateKey}`);
  const appointmentRef = db.collection('appointments').doc();
  const slotRef = db.collection('appointmentSlots').doc(makeSlotId(doctorId, dateKey, time));
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
      if (slot.exists) throw publicError('already-exists', 'That time has just been booked. Please choose another slot.');
      if (currentException.exists && currentException.get('type') === 'closed') throw publicError('failed-precondition', 'This clinic day has just been closed. Please choose another time.');
      const status = context.config.autoConfirm ? 'confirmed' : 'scheduled';
      const createdBy = request.auth ? { uid: request.auth.uid, role } : { uid: null, role: 'public' };
      transaction.set(slotRef, { doctorId, dateKey, startsAt: admin.firestore.Timestamp.fromDate(requested.startsAt), endsAt: admin.firestore.Timestamp.fromDate(requested.endsAt), appointmentId: appointmentRef.id, status: 'booked', createdAt: admin.firestore.FieldValue.serverTimestamp() });
      transaction.set(appointmentRef, {
        reference, branchId, departmentId, doctorId, visitType: context.visitType.id, visitMode: context.visitType.mode, dateKey,
        startsAt: admin.firestore.Timestamp.fromDate(requested.startsAt), endsAt: admin.firestore.Timestamp.fromDate(requested.endsAt),
        status, source: request.auth ? 'patient_portal' : 'web', patientId: request.auth?.uid || null,
        patientSnapshot: { name, phone }, reason: trimmed(reason, 500) || null, slotIds: [slotRef.id],
        consent: { version: trimmed(consentVersion, 40) || 'booking-v1', acceptedAt: admin.firestore.FieldValue.serverTimestamp() },
        createdBy, externalCalendar: { provider: 'google', syncStatus: 'not_connected' }, videoConsultation: context.visitType.mode === 'video' ? { status: 'awaiting_link' } : null, createdAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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

const requireVideoStaff = (request) => {
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
exports.getVideoConsultationQueue = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
  const role = requireVideoStaff(request);
  const now = new Date();
  const from = admin.firestore.Timestamp.fromDate(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const to = admin.firestore.Timestamp.fromDate(new Date(now.getTime() + 31 * 24 * 60 * 60 * 1000));
  let query = db.collection('appointments').where('visitMode', '==', 'video').where('startsAt', '>=', from).where('startsAt', '<=', to);
  if (role === 'doctor') query = query.where('doctorId', '==', request.auth.token.doctorId);
  const snapshot = await query.orderBy('startsAt', 'asc').limit(50).get();
  return {
    appointments: snapshot.docs
      .map((item) => ({ id: item.id, reference: item.get('reference'), doctorId: item.get('doctorId'), startsAt: asDate(item.get('startsAt'))?.toISOString() || null, status: item.get('status'), patient: item.get('patientSnapshot') || {}, videoConsultation: item.get('videoConsultation') || { status: 'awaiting_link' } }))
      .filter((item) => isActiveAppointment(item.status)),
  };
});

exports.setVideoConsultationAccess = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
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
    ? { status: 'ready', joinUrl, preparedBy: request.auth.uid, preparedAt: admin.firestore.FieldValue.serverTimestamp() }
    : { status: 'awaiting_link', clearedBy: request.auth.uid, clearedAt: admin.firestore.FieldValue.serverTimestamp() };
  await ref.set({ videoConsultation, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await db.collection('auditLogs').add({ at: admin.firestore.FieldValue.serverTimestamp(), actor: { uid: request.auth.uid, role }, action: joinUrl ? 'video_access_prepared' : 'video_access_cleared', resource: { type: 'appointment', id: appointmentId }, meta: { visitMode: 'video' } });
  return { message: joinUrl ? 'Secure video access is ready for the patient.' : 'Video access was cleared.' };
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

// Patients may move an eligible future appointment, but all availability and
// slot ownership decisions remain on the trusted server.
exports.reschedulePatientAppointment = onCall({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB', secrets: [GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_TOKEN_KEY] }, async (request) => {
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
    const now = admin.firestore.FieldValue.serverTimestamp();
    existingSlotIds.forEach((slotId) => transaction.delete(db.collection('appointmentSlots').doc(slotId)));
    transaction.set(newSlotRef, { doctorId: appointment.doctorId, dateKey, startsAt: admin.firestore.Timestamp.fromDate(requested.startsAt), endsAt: admin.firestore.Timestamp.fromDate(requested.endsAt), appointmentId: ref.id, status: 'booked', createdAt: now });
    transaction.update(ref, { dateKey, startsAt: admin.firestore.Timestamp.fromDate(requested.startsAt), endsAt: admin.firestore.Timestamp.fromDate(requested.endsAt), slotIds: [newSlotRef.id], updatedAt: now, externalCalendar: { ...(appointment.externalCalendar || {}), syncStatus: appointment.externalCalendar?.eventId ? 'pending' : 'not_connected' } });
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
        await ref.set({ externalCalendar: { ...appointment.externalCalendar, syncStatus: 'synced', lastSyncedAt: admin.firestore.FieldValue.serverTimestamp() }, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      }
    }
  } catch (_error) {
    await ref.set({ externalCalendar: { provider: 'google', syncStatus: 'pending', lastSyncError: 'Calendar event could not be updated.' }, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }
  return { ok: true, ...result };
});

// Closing a day must be deliberate: staff first preview affected appointments,
// then explicitly keep them or cancel every appointment they are permitted to cancel.
exports.closeDay = onCall({ region: 'asia-south1', timeoutSeconds: 60, memory: '256MiB' }, async (request) => {
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
  await db.runTransaction(async (transaction) => {
    const currentAppointments = await Promise.all(appointments.map((appointment) => transaction.get(appointment.ref)));
    await transaction.get(exceptionRef);
    const now = admin.firestore.FieldValue.serverTimestamp();
    transaction.set(exceptionRef, { doctorId, dateKey, type: 'closed', sessions: [], note: closeReason || null, updatedAt: now, updatedBy: request.auth.uid }, { merge: true });
    currentAppointments.forEach((snapshot) => {
      if (!snapshot.exists) return;
      const appointment = snapshot.data();
      if (!isActiveAppointment(appointment.status)) return;
      if (action === 'cancel') {
        if (!canTransition(appointment.status, 'cancelled', role)) throw publicError('failed-precondition', 'An appointment changed and cannot be cancelled by your role. Review the day again.');
        transaction.update(snapshot.ref, { status: 'cancelled', cancellation: { byUid: request.auth.uid, byRole: role, reason: closeReason, at: now }, updatedAt: now });
        const slotIds = Array.isArray(appointment.slotIds) && appointment.slotIds.length ? appointment.slotIds : (appointment.slotId ? [appointment.slotId] : []);
        slotIds.forEach((slotId) => transaction.delete(db.collection('appointmentSlots').doc(slotId)));
        transaction.set(snapshot.ref.collection('events').doc(), { from: appointment.status, to: 'cancelled', byUid: request.auth.uid, byRole: role, reason: closeReason, at: now, meta: { source: 'close_day', dateKey } });
      }
    });
    transaction.set(db.collection('auditLogs').doc(), { at: now, actor: { uid: request.auth.uid, role }, action: 'clinic_day_closed', resource: { type: 'schedule_exception', id: exceptionRef.id }, meta: { doctorId, dateKey, action, affectedAppointments: appointments.length } });
  });
  return { ok: true, doctorId, dateKey, action, affectedAppointments: appointments.length };
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
