const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const functionsRequire = createRequire(path.resolve(__dirname, '../../functions/package.json'));
const { initializeApp, deleteApp } = functionsRequire('firebase-admin/app');
const { getAuth } = functionsRequire('firebase-admin/auth');
let app; let auth;

before(async () => {
  assert.equal(process.env.GCLOUD_PROJECT, 'demo-sood-clinic');
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099');
  assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8080');
  app = initializeApp({ projectId: 'demo-sood-clinic' }, 'staff-access-test');
  auth = getAuth(app);
});
after(async () => { if (app) await deleteApp(app); });

async function tokenFor(uid, role, doctorId) {
  const email = `${uid}@example.test`;
  await auth.createUser({ uid, email, password: 'Emulator9%', emailVerified: true });
  await auth.setCustomUserClaims(uid, { ...(role ? { role } : {}), ...(doctorId ? { doctorId } : {}) });
  const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-only', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'Emulator9%', returnSecureToken: true }),
  });
  assert.equal(response.ok, true);
  return (await response.json()).idToken;
}
async function call(name, token, data = {}) {
  const response = await fetch(`http://127.0.0.1:5001/demo-sood-clinic/asia-south1/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ data }),
  });
  return { status: response.status, body: await response.json() };
}

test('current doctor may save own hours; mismatched or changed scope is rejected', async () => {
  const token = await tokenFor('scope-doctor', 'doctor', 'doctor-a');
  assert.equal((await call('getStaffSession', token)).body.result.role, 'doctor');
  const hours = { doctorId: 'doctor-a', sessions: [{ weekday: 1, start: '09:00', end: '10:00' }] };
  assert.equal((await call('saveDoctorSchedule', token, hours)).status, 200);
  assert.equal((await call('saveDoctorSchedule', token, { ...hours, doctorId: 'doctor-b' })).status, 403);
  const { getFirestore } = functionsRequire('firebase-admin/firestore');
  const appointments = getFirestore(app).collection('appointments');
  await appointments.doc('video-own').set({ doctorId: 'doctor-a', visitMode: 'video', status: 'scheduled', startsAt: new Date(Date.now() + 3600000) });
  await appointments.doc('video-other').set({ doctorId: 'doctor-b', visitMode: 'video', status: 'scheduled', startsAt: new Date(Date.now() + 3600000) });
  assert.equal((await call('setVideoConsultationAccess', token, { appointmentId: 'video-own', joinUrl: 'https://meet.example.test/fixture' })).status, 200);
  assert.equal((await call('setVideoConsultationAccess', token, { appointmentId: 'video-other', joinUrl: 'https://meet.example.test/fixture' })).status, 403);
  assert.equal((await appointments.doc('video-other').get()).get('videoConsultation'), undefined);
  await auth.setCustomUserClaims('scope-doctor', { role: 'doctor', doctorId: 'doctor-b' });
  assert.equal((await call('getStaffSession', token)).status, 403);
  assert.equal((await call('saveDoctorSchedule', token, hours)).status, 403);
  assert.equal((await call('getVideoConsultationQueue', token)).status, 403);
});

test('demoted administrator cannot call protected endpoints using an old ID token', async () => {
  const token = await tokenFor('demoted-admin', 'admin');
  assert.equal((await call('getStaffSession', token)).status, 200);
  await auth.setCustomUserClaims('demoted-admin', { role: 'manager' });
  for (const name of ['getAdminBookingCatalog', 'getAdminPatientProfile', 'googleCalendarStatus']) {
    assert.equal((await call(name, token)).status, 403);
  }
});

test('disabled staff and unsigned callers fail closed; forced users can inspect only their session', async () => {
  const token = await tokenFor('forced-manager', 'manager');
  await auth.setCustomUserClaims('forced-manager', { role: 'manager', forcePasswordChange: true });
  const session = await call('getStaffSession', token);
  assert.equal(session.status, 200);
  assert.equal(session.body.result.mustChangePassword, true);
  assert.equal((await call('searchPatients', token, { term: 'Fixture' })).status, 403);
  await auth.updateUser('forced-manager', { disabled: true });
  assert.equal((await call('getStaffSession', token)).status, 403);
  assert.equal((await call('getStaffSession')).status, 403);
});

test('patient registration and personal-details save persist resolved timestamps', async () => {
  const token = await tokenFor('patient-save-regression');
  assert.equal((await call('registerPatientProfile', token, { displayName: 'Fixture Patient' })).status, 200);
  assert.equal((await call('updateOwnPatientProfile', token, { profile: { displayName: 'Updated Fixture Patient', addressLine1: 'Fixture address' } })).status, 200);
  const { getFirestore } = functionsRequire('firebase-admin/firestore');
  const patient = await getFirestore(app).collection('patients').doc('patient-save-regression').get();
  assert.equal(patient.get('displayName'), 'Updated Fixture Patient');
  assert.equal(patient.get('addressLine1'), 'Fixture address');
  assert.equal(typeof patient.get('updatedAt').toDate, 'function');
});
