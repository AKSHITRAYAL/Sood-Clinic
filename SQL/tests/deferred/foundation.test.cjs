// DEFERRED (2026-10-30): parked with the deferred schema models and connector
// operations. Not run by `npm run sql:test` / `npm run test:migration`.
// Requires the deferred schema models/connectors to be restored (or the SQL
// emulator to serve them) before it can pass; against the reduced first-release
// schema it fails honestly. Restore it with SQL/dataconnect/deferred/.
const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { localDataConnect, seed, functionsRequire } = require('../scripts/local.cjs');
const toolsRequire = createRequire(require.resolve('firebase-tools/package.json'));
const { Client } = toolsRequire('pg');
let sql;
let clinic;
let admin;
// The synthetic rehearsal operations live in the local-only clinic-rehearsal connector.
let rehearsal;
const accessDenied = (error) => /permission.denied|unauthenticated|not authorized|not allowed|NO_ACCESS/i.test(error.message);
const { rehearseBranchStep, branchId: rehearsalBranchId } = require('../scripts/rehearse-branch.cjs');
const { randomUUID, randomBytes } = require('node:crypto');

async function patientHealthFixture(suffix, run) {
  await patientProfileFixture(suffix, async fixture => {
    const readHealth = () => fixture.api.getHealth(fixture.request({ patientId: fixture.patientId }));
    const health = { bloodGroup: 'AB+', allergies: 'Synthetic allergy', currentMedications: 'Synthetic medication', healthNotes: 'Synthetic notes\nSecond line' };
    const saveHealth = async (patch = {}, snapshot, requestId = randomUUID()) => {
      const current = snapshot || await readHealth();
      return fixture.api.saveHealth(fixture.request({ patientId: fixture.patientId, requestId, expectedUpdatedAt: current.updatedAt, profile: { ...health, ...patch } }));
    };
    await run({ ...fixture, health, readHealth, saveHealth });
  });
}

test('SQL patient health creates and clears only self-reported fields with the shared native revision and ID-only audit', async () => patientHealthFixture(101, async ({ health, readHealth, saveHealth, patientId, uid, read }) => {
  const empty = await readHealth();
  assert.deepEqual(empty.profile, { bloodGroup: null, allergies: null, currentMedications: null, healthNotes: null });
  await sql.query("UPDATE clinic_patients SET email='private@example.test',legacy_created_by_uid='private-actor' WHERE id=$1", [patientId]);
  await saveHealth(); const current = await readHealth();
  assert.deepEqual(current.profile, health); assert.notEqual(current.updatedAt, empty.updatedAt);
  assert.equal((await read()).profile.updatedAt, current.updatedAt);
  assert.equal(Object.hasOwn((await read()).profile, 'healthNotes'), false);
  assert.deepEqual((await sql.query('SELECT email,legacy_created_by_uid FROM clinic_patients WHERE id=$1', [patientId])).rows[0], { email: 'private@example.test', legacy_created_by_uid: 'private-actor' });
  assert.equal((await sql.query("SELECT count(*)::int n FROM clinic_audit_logs WHERE actor_uid=$1 AND action='patient_health_saved'", [uid])).rows[0].n, 1);
  assert.equal(JSON.stringify((await sql.query('SELECT * FROM clinic_audit_logs WHERE actor_uid=$1', [uid])).rows).includes('Synthetic allergy'), false);
  await saveHealth({ bloodGroup: null, allergies: '', currentMedications: null, healthNotes: '' });
  assert.deepEqual((await readHealth()).profile, empty.profile);
}));

test('SQL patient health denies other patients and guardian links, including a relationship change just before commit', async () => patientHealthFixture(102, async ({ api, request, patientId, uid, readHealth, saveHealth, store }) => {
  await assert.rejects(api.getHealth(request({ patientId: randomUUID() })), error => error.code === 'permission-denied');
  const current = await readHealth(); const commit = store.saveHealth;
  store.saveHealth = async data => {
    await sql.query("UPDATE clinic_patient_links SET relationship='guardian' WHERE patient_id=$1 AND user_id=$2", [patientId, uid]);
    return commit(data);
  };
  await assert.rejects(saveHealth({}, current), error => error.code === 'permission-denied');
  await assert.rejects(readHealth(), error => error.code === 'permission-denied');
  assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_patient_reported_profiles WHERE patient_id=$1', [patientId])).rows[0].n, 0);
  assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_operation_receipts WHERE actor_uid=$1', [uid])).rows[0].n, 0);
}));

test('SQL health and demographic editors share one revision and concurrent changes cannot overwrite each other', async () => patientHealthFixture(103, async ({ readHealth, saveHealth, read, save, patientId, uid }) => {
  const health = await readHealth(); const demographics = await read();
  assert.equal(health.updatedAt, demographics.profile.updatedAt);
  const outcomes = await Promise.allSettled([saveHealth({ allergies: 'Synthetic changed allergy' }, health), save({ city: 'Synthetic changed city' }, demographics)]);
  assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(row => row.status === 'rejected').reason.code, 'aborted');
  assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_operation_receipts WHERE actor_uid=$1', [uid])).rows[0].n, 1);
  const patient = (await sql.query('SELECT city,blood_group FROM clinic_patients WHERE id=$1', [patientId])).rows[0];
  assert.ok((patient.city === null && patient.blood_group === 'AB+') || (patient.city === 'Synthetic changed city' && patient.blood_group === null));
}));

test('SQL health lost acknowledgements replay once and request IDs cannot cross into demographic writes', async () => patientHealthFixture(104, async ({ readHealth, saveHealth, read, save, store, uid, revoke }) => {
  const current = await readHealth(); const demographics = await read(); const requestId = randomUUID(); const commit = store.saveHealth;
  store.saveHealth = async data => { await commit(data); throw Error('Synthetic lost health acknowledgement'); };
  assert.deepEqual(await saveHealth({}, current, requestId), { saved: true });
  assert.deepEqual(await saveHealth({}, current, requestId), { saved: true });
  await assert.rejects(saveHealth({ healthNotes: 'Different' }, current, requestId), error => error.code === 'already-exists');
  await assert.rejects(save({}, demographics, requestId), error => error.code === 'already-exists');
  assert.equal((await sql.query("SELECT count(*)::int n FROM clinic_audit_logs WHERE actor_uid=$1 AND action='patient_health_saved'", [uid])).rows[0].n, 1);
  await revoke();
  await assert.rejects(saveHealth({}, current, requestId), error => error.code === 'permission-denied');
}));

test('SQL health late audit failure rolls back blood group, private row, native revision and receipt together', async () => patientHealthFixture(105, async ({ readHealth, saveHealth, patientId, uid }) => {
  const before = await readHealth();
  // Exact synthetic actor only; remove the local fault-injection constraint in finally.
  await sql.query("ALTER TABLE clinic_audit_logs ADD CONSTRAINT synthetic_health_audit_failure CHECK (NOT(actor_uid='sql-link-105' AND action='patient_health_saved'))");
  try {
    await assert.rejects(saveHealth({}, before), error => error.code === 'unavailable');
    assert.deepEqual(await readHealth(), before);
    assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_patient_reported_profiles WHERE patient_id=$1', [patientId])).rows[0].n, 0);
    assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_operation_receipts WHERE actor_uid=$1', [uid])).rows[0].n, 0);
  } finally {
    await sql.query('ROLLBACK');
    await sql.query('ALTER TABLE clinic_audit_logs DROP CONSTRAINT synthetic_health_audit_failure');
  }
}));

test('SQL patient health rejects inactive/archived/current-staff access and returns no raw clinical errors', async () => patientHealthFixture(106, async ({ readHealth, saveHealth, patientId, uid, auth }) => {
  const current = await readHealth();
  await sql.query('UPDATE clinic_users SET active=false WHERE id=$1', [uid]);
  await assert.rejects(readHealth(), error => error.code === 'permission-denied');
  await sql.query('UPDATE clinic_users SET active=true WHERE id=$1', [uid]);
  await sql.query('UPDATE clinic_patients SET archived_at=now() WHERE id=$1', [patientId]);
  await assert.rejects(saveHealth({}, current), error => error.code === 'permission-denied');
  await sql.query('UPDATE clinic_patients SET archived_at=null WHERE id=$1', [patientId]);
  for (const role of ['doctor', 'admin', 'manager']) {
    await auth.setCustomUserClaims(uid, { role });
    await assert.rejects(readHealth(), error => error.code === 'permission-denied');
  }
}));

test('patient health IAM operations deny anonymous and every browser role', async () => {
  const scope = { actorUid: 'spoof', patientId: randomUUID() };
  const data = { ...scope, requestId: randomUUID(), operation: 'spoof', expectedUpdatedAt: '2026-10-20T00:00:00Z', bloodGroup: null, allergies: null, currentMedications: null, healthNotes: null };
  for (const impersonate of [{ unauthenticated: true }, ...['patient', 'doctor', 'manager', 'admin'].map(role => ({ authClaims: { sub: `health-${role}`, role } }))]) {
    await assert.rejects(admin.executeQuery('ReadLinkedPatientHealth', scope, { impersonate }), accessDenied);
    await assert.rejects(admin.executeMutation('SaveLinkedPatientHealth', data, { impersonate }), accessDenied);
  }
});

async function patientAppointmentFixture(suffix, run) {
  await patientProfileFixture(suffix, async fixture => {
    const { createSqlPatientAppointments, sqlPatientAppointmentStore } = require('../../functions/lib/sqlPatientAppointments');
    const store = sqlPatientAppointmentStore(admin);
    const api = createSqlPatientAppointments({ auth: fixture.auth, store });
    const ids = [];
    const add = async ({ patientId = fixture.patientId, startsAt = '2026-10-20T03:00:00.123456Z', reference = `SYNTHETIC-APPOINTMENT-${suffix}-${String(ids.length).padStart(3, '0')}` } = {}) => {
      const id = randomUUID(); ids.push(id);
      await sql.query("INSERT INTO clinic_appointments(id,reference,patient_id,doctor_id,branch_id,service_id,starts_at,ends_at,clinic_date,status,source,visit_mode,consent_version,consent_accepted_at,created_at,updated_at) SELECT $1,$2,$3,d.id,d.branch_id,s.id,$4::timestamptz,$4::timestamptz+interval '30 minutes',($4::timestamptz AT TIME ZONE 'Asia/Kolkata')::date,'confirmed','patient','in_person','synthetic-only',now(),now(),now() FROM clinic_doctors d CROSS JOIN clinic_services s LIMIT 1", [id, reference, patientId, startsAt]);
      return id;
    };
    const list = cursor => api.list(fixture.request({ patientId: fixture.patientId, ...(cursor ? { cursor } : {}) }));
    const get = appointmentId => api.get(fixture.request({ patientId: fixture.patientId, appointmentId }));
    try { await run({ ...fixture, api, store, add, list, get }); }
    finally {
      await sql.query('ROLLBACK');
      await sql.query('DELETE FROM clinic_appointment_private_details WHERE appointment_id=ANY($1::uuid[])', [ids]);
      await sql.query('DELETE FROM clinic_appointments WHERE id=ANY($1::uuid[])', [ids]);
    }
  });
}

test('SQL patient appointment history returns only linked operational details, never private snapshots/video/clinical payloads', async () => patientAppointmentFixture(91, async ({ add, list, get }) => {
  const id = await add();
  await sql.query("INSERT INTO clinic_appointment_private_details(appointment_id,reason,snapshot_phone,video_join_url,legacy_slot_list_present) VALUES($1,'Private synthetic reason','Private synthetic phone','https://example.test/private-capability',false)", [id]);
  const result = await list();
  assert.equal(result.appointments.length, 1); assert.equal(result.nextCursor, null);
  const appointment = (await get(id)).appointment;
  assert.equal(appointment.id, id); assert.equal(appointment.startsAt, '2026-10-20T03:00:00.123456Z');
  assert.equal(appointment.timezone, 'Asia/Kolkata'); assert.equal(appointment.clinicDate, '2026-10-20');
  for (const key of ['reason', 'snapshotPhone', 'videoJoinUrl', 'createdByUid', 'patientId', 'legacyId', 'consentVersion']) assert.equal(Object.hasOwn(appointment, key), false);
  assert.equal(JSON.stringify(result).includes('Private synthetic'), false);
}));

test('SQL appointment keyset pagination handles tied native instants without duplicates or skipped rows', async () => patientAppointmentFixture(92, async ({ add, list }) => {
  const ids = [];
  for (let n = 0; n < 23; n++) ids.push(await add());
  const later = await add({ startsAt: '2026-10-20T03:00:00.123457Z' });
  const first = await list(); assert.equal(first.appointments.length, 20); assert.equal(first.appointments[0].id, later);
  assert.equal(first.nextCursor.startsAt, '2026-10-20T03:00:00.123456Z');
  const second = await list(first.nextCursor); assert.equal(second.appointments.length, 4); assert.equal(second.nextCursor, null);
  const all = [...first.appointments, ...second.appointments];
  assert.equal(new Set(all.map(row => row.id)).size, 24);
  assert.deepEqual(new Set(all.map(row => row.id)), new Set([...ids, later]));
  assert.deepEqual((await list(first.nextCursor)).appointments, second.appointments);
}));

test('SQL appointment access never adopts guest bookings and rejects cross-patient detail IDs and revoked links', async () => patientAppointmentFixture(93, async ({ add, list, get, revoke, api, request, patientId }) => {
  const owned = await add(); const guest = await add({ patientId: null });
  assert.deepEqual((await list()).appointments.map(row => row.id), [owned]);
  await assert.rejects(get(guest), error => error.code === 'not-found');
  await assert.rejects(api.get(request({ patientId: '40000000-0000-4000-8000-000000000001', appointmentId: owned })), error => error.code === 'permission-denied');
  await revoke();
  await assert.rejects(list(), error => error.code === 'permission-denied');
  await assert.rejects(get(owned), error => error.code === 'permission-denied');
  assert.equal((await sql.query('SELECT patient_id FROM clinic_appointments WHERE id=$1', [owned])).rows[0].patient_id, patientId);
}));

test('SQL appointment history fails closed for inactive accounts, archived patients and current staff sessions', async () => patientAppointmentFixture(94, async ({ add, list, get, auth, uid, patientId }) => {
  const id = await add();
  await sql.query('UPDATE clinic_users SET active=false WHERE id=$1', [uid]);
  await assert.rejects(list(), error => error.code === 'permission-denied');
  await sql.query('UPDATE clinic_users SET active=true WHERE id=$1', [uid]);
  await sql.query('UPDATE clinic_patients SET archived_at=now() WHERE id=$1', [patientId]);
  await assert.rejects(get(id), error => error.code === 'permission-denied');
  await sql.query('UPDATE clinic_patients SET archived_at=null WHERE id=$1', [patientId]);
  await auth.setCustomUserClaims(uid, { role: 'manager' });
  await assert.rejects(list(), error => error.code === 'permission-denied');
}));

test('SQL appointment projection rejects unreviewed historical mode/date/status instead of inventing values', async () => patientAppointmentFixture(95, async ({ add, list, get }) => {
  const id = await add();
  for (const statement of ["visit_mode=null", "visit_mode='in_person',clinic_date='2026-10-19'", "clinic_date='2026-10-20',status='invented'"]) {
    await sql.query(`UPDATE clinic_appointments SET ${statement} WHERE id=$1`, [id]);
    await assert.rejects(list(), error => error.code === 'failed-precondition');
    await assert.rejects(get(id), error => error.code === 'failed-precondition');
  }
}));

test('patient appointment IAM queries deny all browser roles, including spoofed patient identity', async () => {
  for (const impersonate of [{ unauthenticated: true }, ...['patient', 'manager', 'doctor', 'admin'].map(role => ({ authClaims: { sub: `appointment-${role}`, role } }))]) {
    const common = { actorUid: 'sql-link-91', patientId: randomUUID() };
    await assert.rejects(admin.executeQuery('ListLinkedPatientAppointments', common, { impersonate }), accessDenied);
    await assert.rejects(admin.executeQuery('ListLinkedPatientAppointmentsBefore', { ...common, beforeStartsAt: '2026-10-20T03:00:00.123456Z', beforeReference: 'SYNTHETIC' }, { impersonate }), accessDenied);
    await assert.rejects(admin.executeQuery('ReadLinkedPatientAppointment', { ...common, appointmentId: randomUUID() }, { impersonate }), accessDenied);
  }
});

async function patientProfileFixture(suffix, run) {
  const { getAuth } = functionsRequire('firebase-admin/auth');
  const staffUid = `sql-profile-administrator-${suffix}`;
  await getAuth(admin.app).createUser({ uid: staffUid });
  await getAuth(admin.app).setCustomUserClaims(staffUid, { role: 'admin' });
  const fixture = await linkingFixture(suffix, staffUid);
  const { createSqlPatientProfiles, sqlPatientProfileStore } = require('../../functions/lib/sqlPatientProfiles');
  const store = sqlPatientProfileStore(admin);
  const api = createSqlPatientProfiles({ auth: fixture.auth, store });
  const request = data => ({ auth: { uid: fixture.uid, token: { email_verified: true, auth_time: Math.floor(Date.now() / 1000) + 1 } }, data });
  const read = () => api.get(request({ patientId: fixture.patientId }));
  const save = async (patch = {}, snapshot, requestId = randomUUID()) => {
    const current = snapshot || await read();
    return api.save(request({ patientId: fixture.patientId, requestId, expectedUpdatedAt: current.profile.updatedAt, profile: { displayName: 'Synthetic Patient', phone: '+919876543210', title: 'Dr.', gender: 'Male', maritalStatus: 'Single', ...patch } }));
  };
  try {
    await fixture.accept((await fixture.issue()).code);
    await run({ ...fixture, store, api, request, read, save });
  } finally {
    await sql.query('ROLLBACK');
    await sql.query('DELETE FROM clinic_patient_link_invitations WHERE user_id=$1', [fixture.uid]);
    await sql.query('DELETE FROM clinic_patient_links WHERE user_id=$1', [fixture.uid]);
    await sql.query('DELETE FROM clinic_patient_reported_profiles WHERE patient_id=$1', [fixture.patientId]);
    await sql.query('DELETE FROM clinic_patients WHERE id=$1', [fixture.patientId]);
    await sql.query('DELETE FROM clinic_users WHERE id=$1', [fixture.uid]);
    await sql.query('DELETE FROM clinic_operation_receipts WHERE actor_uid=$1', [fixture.uid]);
    await sql.query('DELETE FROM clinic_audit_logs WHERE actor_uid=$1 OR resource_id=$2', [fixture.uid, `${fixture.patientId}/${fixture.uid}`]);
    await fixture.auth.deleteUser(fixture.uid);
    await fixture.auth.deleteUser(staffUid);
    await sql.query('DELETE FROM clinic_audit_logs WHERE actor_uid=$1', [staffUid]);
  }
}

test('SQL linked demographics save preserves private clinical/provenance fields and returns only scoped profiles', async () => patientProfileFixture(81, async ({ api, request, read, save, patientId, uid }) => {
  await sql.query("UPDATE clinic_patients SET email='synthetic@example.test',legacy_created_by_uid='private-actor',blood_group='AB+' WHERE id=$1", [patientId]);
  await sql.query("INSERT INTO clinic_patient_reported_profiles(patient_id,health_notes) VALUES($1,'Private synthetic health')", [patientId]);
  await save({ dateOfBirth: '2000-02-29', addressLine1: 'Synthetic address' });
  const result = await read();
  assert.equal(result.profile.displayName, 'Synthetic Patient'); assert.equal(result.profile.patientId, patientId);
  for (const key of ['email', 'healthNotes', 'bloodGroup', 'legacyCreatedByUid']) assert.equal(Object.hasOwn(result.profile, key), false);
  assert.deepEqual((await api.list(request({}))).patients, [{ patientId, uhid: 'TEST-LINK-81', displayName: 'Synthetic Patient', relationship: 'self' }]);
  assert.deepEqual((await sql.query('SELECT email,legacy_created_by_uid,blood_group FROM clinic_patients WHERE id=$1', [patientId])).rows[0], { email: 'synthetic@example.test', legacy_created_by_uid: 'private-actor', blood_group: 'AB+' });
  assert.equal((await sql.query('SELECT health_notes FROM clinic_patient_reported_profiles WHERE patient_id=$1', [patientId])).rows[0].health_notes, 'Private synthetic health');
  const audits = (await sql.query("SELECT resource_id FROM clinic_audit_logs WHERE actor_uid=$1 AND action='patient_demographics_saved'", [uid])).rows;
  assert.equal(audits.length, 1); assert.equal(audits[0].resource_id.replaceAll('-', ''), patientId.replaceAll('-', ''));
  assert.equal(JSON.stringify(audits).includes('Synthetic Patient'), false);
}));

test('SQL profile save rejects cross-patient access and rechecks a revoked link inside its transaction', async () => patientProfileFixture(82, async ({ api, request, store, save, read, patientId, uid, revoke }) => {
  await assert.rejects(api.get(request({ patientId: '40000000-0000-4000-8000-000000000001' })), error => error.code === 'permission-denied');
  const before = await read(); const commit = store.save;
  store.save = async data => { await revoke(); return commit(data); };
  await assert.rejects(save({}, before), error => error.code === 'permission-denied');
  assert.equal((await sql.query('SELECT display_name FROM clinic_patients WHERE id=$1', [patientId])).rows[0].display_name, 'Synthetic patient');
  assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_operation_receipts WHERE actor_uid=$1', [uid])).rows[0].n, 0);
}));

test('SQL profile optimistic save allows one concurrent editor and reconciles lost responses without duplicate audit', async () => patientProfileFixture(83, async ({ store, read, save, uid }) => {
  const before = await read();
  const outcomes = await Promise.allSettled([save({ city: 'Synthetic A' }, before), save({ city: 'Synthetic B' }, before)]);
  assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(row => row.status === 'rejected').reason.code, 'aborted');
  const current = await read(); const requestId = randomUUID(); const commit = store.save;
  store.save = async data => { await commit(data); throw Error('Synthetic lost acknowledgement'); };
  assert.deepEqual(await save({ city: 'Synthetic C' }, current, requestId), { saved: true });
  assert.deepEqual(await save({ city: 'Synthetic C' }, current, requestId), { saved: true });
  await assert.rejects(save({ city: 'Different payload' }, current, requestId), error => error.code === 'already-exists');
  assert.equal((await sql.query("SELECT count(*)::int n FROM clinic_audit_logs WHERE actor_uid=$1 AND action='patient_demographics_saved'", [uid])).rows[0].n, 2);
}));

test('SQL profile writes roll back on late failure, account deactivation or patient archive', async () => patientProfileFixture(84, async ({ store, save, read, patientId, uid, api, request }) => {
  const current = await read(); const commit = store.save;
  store.save = data => commit({ ...data, expectedUpdatedAt: '2000-01-01T00:00:00Z' });
  await assert.rejects(save({}, current));
  assert.deepEqual(await read(), current);
  store.save = async data => { await sql.query('UPDATE clinic_users SET active=false WHERE id=$1', [uid]); return commit(data); };
  await assert.rejects(save({}, current));
  assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_operation_receipts WHERE actor_uid=$1', [uid])).rows[0].n, 0);
  await sql.query('UPDATE clinic_users SET active=true WHERE id=$1', [uid]);
  store.save = commit;
  await sql.query('UPDATE clinic_patients SET archived_at=now() WHERE id=$1', [patientId]);
  await assert.rejects(save({}, current), error => error.code === 'permission-denied');
  assert.deepEqual(await api.list(request({})), { patients: [] });
}));

test('SQL profile committed retries are denied after live Auth demotion or link revocation', async () => patientProfileFixture(85, async ({ read, save, auth, uid, revoke }) => {
  const current = await read(); const requestId = randomUUID();
  await save({}, current, requestId);
  await auth.setCustomUserClaims(uid, { role: 'manager' });
  await assert.rejects(save({}, current, requestId), error => error.code === 'permission-denied');
  await auth.setCustomUserClaims(uid, {});
  await revoke();
  await assert.rejects(save({}, current, requestId), error => error.code === 'permission-denied');
}));

test('SQL guardian demographic access requires an accepted explicit link; an account alone grants nothing', async () => patientProfileFixture(86, async ({ patientId, uid, read, save, revoke, api, request }) => {
  await sql.query("UPDATE clinic_patient_links SET relationship='guardian' WHERE patient_id=$1 AND user_id=$2", [patientId, uid]);
  assert.equal((await read()).profile.relationship, 'guardian');
  await save({ emergencyContactName: 'Synthetic guardian' });
  assert.equal((await read()).profile.emergencyContactName, 'Synthetic guardian');
  await revoke();
  assert.deepEqual(await api.list(request({})), { patients: [] });
  await assert.rejects(read(), error => error.code === 'permission-denied');
}));

test('patient demographic IAM operations deny anonymous and every browser role', async () => {
  const data = { actorUid: 'spoof', patientId: randomUUID(), requestId: randomUUID(), operation: 'spoof', expectedUpdatedAt: '2026-10-20T00:00:00Z', displayName: 'Synthetic', phone: '+919876543210', title: null, dateOfBirth: null, gender: null, maritalStatus: null, addressLine1: null, city: null, state: null, postalCode: null, emergencyContactName: null, emergencyContactPhone: null };
  for (const impersonate of [{ unauthenticated: true }, ...['patient', 'manager', 'doctor', 'admin'].map(role => ({ authClaims: { sub: `profile-${role}`, role } }))]) {
    await assert.rejects(admin.executeQuery('ListLinkedPatientProfiles', { actorUid: data.actorUid }, { impersonate }), accessDenied);
    await assert.rejects(admin.executeQuery('ReadLinkedPatientProfile', { actorUid: data.actorUid, patientId: data.patientId }, { impersonate }), accessDenied);
    await assert.rejects(admin.executeQuery('GetPatientProfileReceipt', { actorUid: data.actorUid, requestId: data.requestId }, { impersonate }), accessDenied);
    await assert.rejects(admin.executeMutation('SaveLinkedPatientProfile', data, { impersonate }), accessDenied);
  }
});

async function bookingSettingsFixture(suffix, run) {
  const { getAuth } = functionsRequire('firebase-admin/auth');
  const { createBookingSettings, sqlBookingSettingsStore, selectVisitType } = require('../../functions/lib/bookingSettings');
  const auth = getAuth(admin.app); const uid = `sql-booking-settings-${suffix}`;
  await auth.createUser({ uid }); await auth.setCustomUserClaims(uid, { role: 'admin' });
  const store = sqlBookingSettingsStore(admin); const api = createBookingSettings({ auth, store });
  const request = data => ({ auth: { uid, token: { role: 'admin', auth_time: Math.floor(Date.now() / 1000) + 1 } }, data });
  const added = [];
  const original = (await sql.query("SELECT legacy_id,legacy_sort_order,name,duration_minutes,consultation_mode,active,fee_paise FROM clinic_services WHERE code='consultation'")).rows[0];
  await sql.query("INSERT INTO clinic_settings(id,booking_window_days,lead_minutes,slot_minutes,interval_minutes,buffer_before_minutes,buffer_after_minutes,cancel_cutoff_minutes,auto_confirm,updated_at) VALUES('primary',14,30,20,20,0,0,120,false,now())");
  await sql.query("UPDATE clinic_services SET legacy_id='consultation',legacy_sort_order=0,updated_at=now() WHERE code='consultation'");
  const read = () => api.get(request({}));
  const settings = async (patch, snapshot, requestId = randomUUID()) => {
    const current = snapshot || await read();
    return api.saveSettings(request({ requestId, expectedUpdatedAt: current.updatedAt, settings: { ...current.settings, ...patch } }));
  };
  const format = async (record, snapshot, requestId = randomUUID()) => {
    const current = snapshot || await read();
    if (!current.visitTypes.some(row => row.id === record.id)) added.push(requestId);
    return api.saveService(request({ requestId, expectedUpdatedAt: current.updatedAt, record }));
  };
  try { await run({ api, store, auth, uid, request, read, settings, format, selectVisitType }); }
  finally {
    await sql.query('ROLLBACK');
    for (const id of added) await sql.query('DELETE FROM clinic_services WHERE id=$1', [id]);
    await sql.query("UPDATE clinic_services SET legacy_id=$1,legacy_sort_order=$2,name=$3,duration_minutes=$4,consultation_mode=$5,active=$6,fee_paise=$7,updated_at=now() WHERE code='consultation'", [original.legacy_id, original.legacy_sort_order, original.name, original.duration_minutes, original.consultation_mode, original.active, original.fee_paise]);
    await sql.query("DELETE FROM clinic_settings WHERE id='primary'");
    await sql.query('DELETE FROM clinic_operation_receipts WHERE actor_uid=$1', [uid]);
    await sql.query('DELETE FROM clinic_audit_logs WHERE actor_uid=$1', [uid]);
    await auth.deleteUser(uid);
  }
}







async function catalogueFixture(suffix, run) {
  const { getAuth } = functionsRequire('firebase-admin/auth');
  const { createSqlCatalogue, sqlCatalogueStore } = require('../../functions/lib/sqlCatalogue');
  const auth = getAuth(admin.app); const uid = `sql-catalogue-admin-${suffix}`;
  await auth.createUser({ uid }); await auth.setCustomUserClaims(uid, { role: 'admin' });
  const store = sqlCatalogueStore(admin); const service = createSqlCatalogue({ auth, store });
  const request = data => ({ auth: { uid, token: { role: 'admin', auth_time: Math.floor(Date.now() / 1000) + 1 } }, data });
  const branchId = randomUUID(); const departmentId = randomUUID(); const doctorId = randomUUID();
  const branchAlias = `synthetic-clinic-${suffix}`; const departmentAlias = `synthetic-gastro-${suffix}`; const doctorAlias = `Synthetic_Doctor_${suffix}`;
  const create = async (action, record, requestId = randomUUID()) => service.save(request({ action, record, requestId, expectedUpdatedAt: null }));
  const edit = async (action, row, patch = {}, requestId = randomUUID()) => {
    const { updatedAt, timezone, ...record } = row;
    return service.save(request({ action, record: { ...record, ...patch }, requestId, expectedUpdatedAt: updatedAt }));
  };
  try {
    await create('branch', { id: branchAlias, name: 'Synthetic Clinic', code: `SYN-${suffix}`, address: 'Synthetic address', active: true }, branchId);
    await create('department', { id: departmentAlias, branchId: branchAlias, name: 'Synthetic Gastro', code: `SYN-G-${suffix}`, description: '', sortOrder: 0, active: true, publicBookingEnabled: true }, departmentId);
    await create('doctor', { id: doctorAlias, branchId: branchAlias, departmentIds: [departmentAlias], name: 'Synthetic Doctor', qualification: '', registrationNumber: `SYN-REG-${suffix}`, active: true, bookingEnabled: true }, doctorId);
    await run({ auth, uid, store, service, request, create, edit, branchId, departmentId, doctorId, branchAlias, departmentAlias, doctorAlias });
  } finally {
    await sql.query('ROLLBACK');
    await sql.query('DELETE FROM clinic_doctor_departments WHERE doctor_id=$1', [doctorId]);
    await sql.query('DELETE FROM clinic_doctors WHERE id=$1', [doctorId]);
    await sql.query('DELETE FROM clinic_departments WHERE id=$1', [departmentId]);
    await sql.query('DELETE FROM clinic_branches WHERE id=$1', [branchId]);
    await sql.query('DELETE FROM clinic_operation_receipts WHERE actor_uid=$1', [uid]);
    await sql.query('DELETE FROM clinic_audit_logs WHERE actor_uid=$1', [uid]);
    await auth.deleteUser(uid);
  }
}







async function contactFixture(suffix, run) {
  const { getAuth } = functionsRequire('firebase-admin/auth');
  const { createClinicContact, sqlClinicContactStore } = require('../../functions/lib/clinicContact');
  const auth = getAuth(admin.app); const uid = `sql-contact-admin-${suffix}`;
  await auth.createUser({ uid }); await auth.setCustomUserClaims(uid, { role: 'admin' });
  const store = sqlClinicContactStore(admin);
  const service = createClinicContact({ auth, store });
  const request = data => ({ auth: { uid, token: { role: 'admin', auth_time: Math.floor(Date.now() / 1000) + 1 } }, data });
  const before = (await service.get(request({}))).profile;
  const input = { requestId: randomUUID(), expectedUpdatedAt: before.updatedAt, profile: { name: 'Synthetic Contact Clinic', phone: '+918988207797', email: 'synthetic@example.test', address: 'Synthetic clinic address' } };
  try { await run({ auth, uid, store, service, request, before, input }); }
  finally {
    await sql.query('ROLLBACK');
    await sql.query("UPDATE clinic_profiles SET name=$1,phone=$2,email=$3,address=$4,timezone=$5,updated_at=now() WHERE id='sood-clinic'", [before.name, before.phone, before.email, before.address, before.timezone]);
    await sql.query('DELETE FROM clinic_operation_receipts WHERE actor_uid=$1', [uid]);
    await sql.query('DELETE FROM clinic_audit_logs WHERE actor_uid=$1', [uid]);
    await auth.deleteUser(uid);
  }
}





async function withRehearsalBranch(run) {
  const beforeAt = '2026-10-19T00:00:00.000000Z';
  const input = { requestId: randomUUID(), action: 'apply', expectedName: 'Synthetic Before', expectedAt: beforeAt, name: 'Synthetic After', sourceInstant: '2026-10-20T00:00:00.123456789Z' };
  await sql.query("INSERT INTO clinic_branches(id,code,name,address,timezone,active,created_at,updated_at) VALUES($1,'SQL-REHEARSAL-ONLY','Synthetic Before','Synthetic address','Asia/Kolkata',false,$2,$2)", [rehearsalBranchId, beforeAt]);
  await sql.query("INSERT INTO clinic_legacy_source_instants(entity_type,entity_id,field,source_path,sql_value,exact_value) VALUES('Branch',$1,'updatedAt','synthetic/migration-rehearsal',$2,'2026-10-19T00:00:00.000000000Z')", [rehearsalBranchId, beforeAt]);
  try { await run(input); }
  finally {
    await sql.query('ROLLBACK');
    await sql.query("DELETE FROM clinic_audit_logs WHERE actor_uid='migration-rehearsal' AND resource_id=$1", [rehearsalBranchId]);
    await sql.query("DELETE FROM clinic_operation_receipts WHERE actor_uid='migration-rehearsal'");
    await sql.query("DELETE FROM clinic_legacy_source_instants WHERE entity_type='Branch' AND entity_id=$1", [rehearsalBranchId]);
    await sql.query("DELETE FROM clinic_branches WHERE id=$1 AND code='SQL-REHEARSAL-ONLY'", [rehearsalBranchId]);
  }
}

test('synthetic IAM CAS commits domain, exact evidence, audit and receipt together; retry is read-only', async () => withRehearsalBranch(async input => {
  assert.deepEqual(await rehearseBranchStep(input), { status: 'applied', applied: 1, replayed: 0, productionReady: false });
  assert.deepEqual(await rehearseBranchStep(input), { status: 'replayed', applied: 0, replayed: 1, productionReady: false });
  const state = (await rehearsal.executeQuery('InspectBranchRehearsal', { requestId: input.requestId })).data;
  assert.equal(state.branch.name, 'Synthetic After');
  assert.equal(state.legacySourceInstant.exactValue, input.sourceInstant);
  const { timestampNanos } = require('../migration/rehearsal.cjs');
  assert.equal(timestampNanos(state.legacySourceInstant.sqlValue), timestampNanos(state.branch.updatedAt));
  assert.equal((await sql.query("SELECT count(*)::int n FROM clinic_audit_logs WHERE actor_uid='migration-rehearsal'")).rows[0].n, 1);
  await assert.rejects(rehearseBranchStep({ ...input, name: 'Synthetic Changed Request' }), /REHEARSAL_REQUEST_REUSE_CONFLICT/);
}));

test('synthetic CAS rejects stale content/version and transaction failure leaves no partial evidence/receipt', async () => withRehearsalBranch(async input => {
  await assert.rejects(rehearseBranchStep({ ...input, expectedName: 'Synthetic Wrong Before' }), /REHEARSAL_WRITE_REJECTED/);
  await assert.rejects(rehearseBranchStep({ ...input, expectedAt: '2026-10-18T00:00:00.000000Z' }), /REHEARSAL_WRITE_REJECTED/);
  await sql.query("INSERT INTO clinic_audit_logs(id,actor_uid,actor_role,action,resource_type,resource_id,occurred_at) VALUES($1,'migration-rehearsal','system','synthetic_collision','synthetic_branch',$2,now())", [input.requestId, rehearsalBranchId]);
  // The SDK hides the database constraint error; absence of a receipt alone cannot prove no commit.
  await assert.rejects(rehearseBranchStep(input), /REHEARSAL_STATE_UNCERTAIN/);
  const state = (await rehearsal.executeQuery('InspectBranchRehearsal', { requestId: input.requestId })).data;
  assert.equal(state.branch.name, input.expectedName);
  assert.equal(state.legacySourceInstant.exactValue, '2026-10-19T00:00:00.000000000Z');
  assert.equal(state.operationReceipt, null);
}));

test('synthetic concurrent retry applies once and conflicting CAS requests have one winner', async () => withRehearsalBranch(async input => {
  const repeats = await Promise.all([rehearseBranchStep(input), rehearseBranchStep(input)]);
  assert.equal(repeats.reduce((n, value) => n + value.applied, 0), 1);
  const next = { ...input, requestId: randomUUID(), expectedName: input.name, expectedAt: '2026-10-20T00:00:00.123456Z', sourceInstant: '2026-10-21T00:00:00.000000001Z' };
  const race = await Promise.allSettled([rehearseBranchStep({ ...next, name: 'Synthetic Winner A' }), rehearseBranchStep({ ...next, requestId: randomUUID(), name: 'Synthetic Winner B' })]);
  assert.equal(race.filter(value => value.status === 'fulfilled').length, 1);
  assert.match(race.find(value => value.status === 'rejected').reason.message, /REHEARSAL_WRITE_REJECTED/);
}));

test('synthetic encrypted before-image supports guarded logical restore with a fresh version, not a database restore', async () => withRehearsalBranch(async input => {
  const fs = require('node:fs/promises'); const os = require('node:os'); const path = require('node:path');
  const { encodeInspectionSource, openInspectionSource } = require('../migration/protected-reader.cjs');
  const key = randomBytes(32); const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clinic-restore-')); await fs.chmod(dir, 0o700);
  try {
    const file = path.join(dir, 'before.bin');
    const businessBefore = (await sql.query("SELECT to_jsonb(b) - 'updated_at' AS content FROM clinic_branches b WHERE id=$1", [rehearsalBranchId])).rows[0].content;
    const contentSnapshot = { complete: true, tables: ['Branch'], rows: [{ entityType: 'Branch', key: [rehearsalBranchId], version: input.expectedAt, content: businessBefore }] };
    await fs.writeFile(file, encodeInspectionSource([], { contentSnapshot }, key), { flag: 'wx', mode: 0o600 });
    await rehearseBranchStep(input);
    const before = (await (await openInspectionSource(file, key)).page()).targets.contentSnapshot.rows[0].content;
    const restore = { ...input, requestId: randomUUID(), action: 'restore', expectedName: input.name, expectedAt: '2026-10-20T00:00:00.123456Z', name: before.name, sourceInstant: '2026-10-21T00:00:00.000000001Z' };
    await rehearseBranchStep(restore);
    const state = (await rehearsal.executeQuery('InspectBranchRehearsal', { requestId: restore.requestId })).data;
    assert.equal(state.branch.name, before.name); assert.equal(state.auditLog.action, 'migration_rehearsal_restore');
    assert.deepEqual((await sql.query("SELECT to_jsonb(b) - 'updated_at' AS content FROM clinic_branches b WHERE id=$1", [rehearsalBranchId])).rows[0].content, before);
    assert.equal(state.legacySourceInstant.exactValue, restore.sourceInstant);
    await assert.rejects(rehearseBranchStep(input), /REHEARSAL_REPLAY_STATE_CHANGED/);
    assert.equal((await rehearseBranchStep(restore)).status, 'replayed');
    await assert.rejects(rehearseBranchStep({ ...restore, requestId: randomUUID(), expectedName: 'Synthetic Before Intervening Write' }), /REHEARSAL_WRITE_REJECTED/);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}));

test('synthetic rehearsal IAM operations deny every browser role and anonymous callers', async () => withRehearsalBranch(async input => {
  const variables = { requestId: input.requestId, expectedName: input.expectedName, expectedAt: input.expectedAt, name: input.name, updatedAt: '2026-10-20T00:00:00.123456Z', exactValue: input.sourceInstant, operation: 'synthetic', action: 'migration_rehearsal_apply' };
  for (const impersonate of [{ unauthenticated: true }, ...['patient', 'manager', 'doctor', 'admin'].map(role => ({ authClaims: { sub: `synthetic-${role}`, role } }))]) {
    await assert.rejects(rehearsal.executeMutation('RehearseBranchCompareAndSet', variables, { impersonate }), accessDenied);
    await assert.rejects(rehearsal.executeQuery('InspectBranchRehearsal', { requestId: input.requestId }, { impersonate }), accessDenied);
  }
}));

test('synthetic driver refuses arbitrary IDs, actions, names and collapsed or non-advancing versions', async () => withRehearsalBranch(async input => {
  for (const patch of [{ branchId: rehearsalBranchId }, { action: 'delete' }, { name: 'Not a synthetic name' }, { requestId: 'not-a-uuid' }, { sourceInstant: input.expectedAt }, { expectedAt: '2026-10-19T00:00:00.000000001Z' }, { sourceInstant: '2026-10-19T00:00:00.000000001Z' }]) await assert.rejects(rehearseBranchStep({ ...input, ...patch }), /REHEARSAL_INPUT_REJECTED/);
  assert.equal((await rehearsal.executeQuery('InspectBranchRehearsal', { requestId: input.requestId })).data.branch.name, input.expectedName);
}));

test('synthetic lost commit acknowledgement reconciles receipt rather than writing twice', async () => withRehearsalBranch(async input => {
  const execute = rehearsal.executeMutation;
  rehearsal.executeMutation = async (...args) => { await execute.apply(rehearsal, args); throw new Error('Synthetic lost response'); };
  try {
    const result = await rehearseBranchStep(input);
    assert.equal(result.status, 'replayed'); assert.equal(result.applied, 0);
    assert.equal((await sql.query("SELECT count(*)::int n FROM clinic_operation_receipts WHERE actor_uid='migration-rehearsal'")).rows[0].n, 1);
  } finally { rehearsal.executeMutation = execute; }
}));

test('synthetic unknown transport outcome stays uncertain when no committed receipt can be confirmed', async () => withRehearsalBranch(async input => {
  const execute = rehearsal.executeMutation;
  rehearsal.executeMutation = async () => { throw new Error('Synthetic unknown transport outcome'); };
  try { await assert.rejects(rehearseBranchStep(input), /REHEARSAL_STATE_UNCERTAIN/); }
  finally { rehearsal.executeMutation = execute; }
  assert.equal((await rehearsal.executeQuery('InspectBranchRehearsal', { requestId: input.requestId })).data.branch.name, input.expectedName);
}));

test('synthetic replay cannot ignore changed scope, source evidence or audit identity', async () => withRehearsalBranch(async input => {
  await rehearseBranchStep(input);
  await sql.query('UPDATE clinic_branches SET active=true WHERE id=$1', [rehearsalBranchId]);
  await assert.rejects(rehearseBranchStep(input), /REHEARSAL_REPLAY_STATE_CHANGED/);
  await sql.query('UPDATE clinic_branches SET active=false WHERE id=$1', [rehearsalBranchId]);
  await sql.query("UPDATE clinic_legacy_source_instants SET source_path='synthetic/changed' WHERE entity_id=$1", [rehearsalBranchId]);
  await assert.rejects(rehearseBranchStep(input), /REHEARSAL_REPLAY_STATE_CHANGED/);
  await sql.query("UPDATE clinic_legacy_source_instants SET source_path='synthetic/migration-rehearsal' WHERE entity_id=$1", [rehearsalBranchId]);
  await sql.query("UPDATE clinic_audit_logs SET actor_role='changed' WHERE id=$1", [input.requestId]);
  await assert.rejects(rehearseBranchStep(input), /REHEARSAL_REPLAY_STATE_CHANGED/);
}));

test('local read-only target capture derives complete scoped columns/keys with exact timestamps and encrypted-only output', async () => withRehearsalBranch(async input => {
  const { captureLocalTargets } = require('../scripts/capture-local-targets.cjs');
  const fs = require('node:fs/promises'); const os = require('node:os'); const path = require('node:path');
  const { openInspectionSource } = require('../migration/protected-reader.cjs');
  const key = randomBytes(32); const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clinic-capture-')); await fs.chmod(dir, 0o700);
  try {
    const capture = await captureLocalTargets(key);
    assert.equal(capture.mode, 'local_target_snapshot'); assert.equal(capture.productionReady, false);
    assert.equal(Object.keys(capture.counts).length, 23); assert.ok(capture.counts.Branch >= 2);
    assert.ok(Buffer.isBuffer(capture.encrypted)); assert.ok(!capture.encrypted.includes(Buffer.from('Synthetic Before')));
    const file = path.join(dir, 'snapshot.bin'); await fs.writeFile(file, capture.encrypted, { mode: 0o600, flag: 'wx' });
    const page = await (await openInspectionSource(file, key)).page();
    const snapshot = page.targets.contentSnapshot;
    assert.ok(!snapshot.tables.includes('PatientLinkInvitation')); assert.ok(!snapshot.tables.includes('AuditLog'));
    const branch = snapshot.rows.find(row => row.entityType === 'Branch' && row.key[0] === rehearsalBranchId);
    assert.equal(branch.content.updatedAt, input.expectedAt); assert.equal(branch.version, input.expectedAt);
    assert.equal(branch.content.active, false); assert.equal(branch.content.legacyId, null);
    const membership = snapshot.rows.find(row => row.entityType === 'DoctorDepartment');
    assert.deepEqual(membership.key, [membership.content.doctorId, membership.content.departmentId]);
    assert.equal((await rehearsal.executeQuery('InspectBranchRehearsal', { requestId: input.requestId })).data.branch.name, input.expectedName);
    await rehearseBranchStep(input);
    const changed = await captureLocalTargets(key); const current = path.join(dir, 'current.bin');
    await fs.writeFile(current, changed.encrypted, { mode: 0o600, flag: 'wx' });
    const comparison = await (await openInspectionSource(file, key)).reconcileSnapshot(current);
    assert.equal(comparison.target.changed, 2); // Domain and exact evidence, not excluded audit/receipts.
    assert.equal(comparison.status, 'conflict'); assert.equal(comparison.readyForApply, false);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}));

test('local target capture refuses an oversized census rather than labeling a partial page complete', async () => {
  const { captureLocalTargets } = require('../scripts/capture-local-targets.cjs');
  try {
    await sql.query("INSERT INTO clinic_branches(id,code,name,address,timezone,active,created_at,updated_at) SELECT gen_random_uuid(),'SQL-CAPTURE-BOUND-'||n,'Synthetic Capture Bound','Synthetic address','Asia/Kolkata',false,now(),now() FROM generate_series(1,10001) n");
    await assert.rejects(captureLocalTargets(randomBytes(32)), /LOCAL_SNAPSHOT_REJECTED/);
  } finally { await sql.query("DELETE FROM clinic_branches WHERE code LIKE 'SQL-CAPTURE-BOUND-%'"); }
});

before(async () => {
  admin = localDataConnect();
  clinic = localDataConnect('clinic');
  rehearsal = localDataConnect('clinic-rehearsal');
  sql = new Client({ host: '127.0.0.1', port: 9398, database: 'ak-sood-clinic-database', user: 'postgres' });
  await sql.connect();
  await seed();
});

after(async () => { await sql?.end(); });
// PGlite shares one backend session; clear rejected transaction state between cases.
afterEach(async () => { await sql?.query('ROLLBACK'); });







test('exact source instants survive PostgreSQL round-trip alongside native values and remain private', async () => {
  const { fixtures } = require('../migration/fixtures.cjs');
  const { mapCatalogRecord, timestampNanos } = require('../migration/rehearsal.cjs');
  const { prepareMigrationTimestamps, encodeInstant, restoreInstant } = require('../migration/instant-preservation.cjs');
  const source = structuredClone(fixtures.find(row => row.path === 'branches/fixture-branch'));
  source.data.createdAt = '1969-12-31T23:59:59.999999999Z';
  source.data.updatedAt = { seconds: 1792368000, nanoseconds: 123456789 };
  const prepared = prepareMigrationTimestamps(mapCatalogRecord(source, [source]));
  assert.equal(prepared.status, 'prepared');
  assert.equal(prepared.readyForApply, false);
  const insert = async (table, row) => {
    const columns = Object.keys(row).map(key => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`));
    await sql.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
  };
  await sql.query('BEGIN');
  try {
    await insert('clinic_branches', prepared.rows.branch);
    for (const row of prepared.rows.legacySourceInstants) await insert('clinic_legacy_source_instants', row);
    for (const [entityId, value] of [['synthetic-min', { seconds: -62135596800, nanoseconds: 1 }], ['synthetic-max', { seconds: 253402300799, nanoseconds: 999999999 }]]) {
      await insert('clinic_legacy_source_instants', { entityType: 'SyntheticBoundary', entityId, field: 'createdAt', sourcePath: 'synthetic/boundary', ...encodeInstant(value) });
    }
    const stored = (await sql.query(`SELECT entity_id AS "entityId", field, to_char(sql_value AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "sqlValue", exact_value AS "exactValue" FROM clinic_legacy_source_instants`)).rows;
    assert.equal(stored.length, 4);
    for (const row of stored) assert.equal(restoreInstant(row), timestampNanos(row.exactValue));
    const branchTime = (await sql.query(`SELECT to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS value FROM clinic_branches WHERE id = $1`, [prepared.rows.branch.id])).rows[0].value;
    const evidence = stored.find(row => row.field === 'updatedAt' && row.entityId === prepared.rows.branch.id);
    assert.equal(branchTime, evidence.sqlValue);
    assert.equal(restoreInstant(evidence), timestampNanos(source.data.updatedAt));
    assert.throws(() => restoreInstant({ ...evidence, sqlValue: '2026-10-19T00:00:00.123457Z' }), /INSTANT_RECONCILIATION_FAILED/);
    await assert.rejects(insert('clinic_legacy_source_instants', prepared.rows.legacySourceInstants[0]), { code: '23505' });
  } finally { await sql.query('ROLLBACK'); }
  assert.equal((await sql.query('SELECT count(*)::int AS n FROM clinic_legacy_source_instants')).rows[0].n, 0);
  const publicResult = await clinic.executeQuery('GetPublicClinic', undefined, { impersonate: { unauthenticated: true } });
  assert.doesNotMatch(JSON.stringify(publicResult.data), /exactValue|sourcePath|legacySourceInstants/);
  for (const impersonate of [{ unauthenticated: true }, ...['patient', 'manager', 'doctor', 'admin'].map(role => ({ authClaims: { sub: `synthetic-${role}`, role } }))]) await assert.rejects(clinic.executeQuery('ListLegacySourceInstants', undefined, { impersonate }), /not found/i);
});

test('private appointment payloads and ordered legacy slots round-trip without client access or ownership grants', async () => {
  const { fixtures, targetSnapshot } = require('../migration/fixtures.cjs');
  const { mapPatientRecord, mapBookingConfig, mapAppointmentRecord } = require('../migration/rehearsal.cjs');
  const records = structuredClone(fixtures);
  const patient = records.find(row => row.path === 'patients/fixture-account');
  patient.data.createdAt = patient.data.updatedAt;
  const config = records.find(row => row.path === 'clinic/publicConfig');
  config.data.updatedAt = config.data.createdAt = patient.data.updatedAt;
  Object.assign(config.data.visitTypes[0], { id: 'synthetic-private-visit', active: true, mode: 'video' });
  const appointment = records.find(row => row.path === 'appointments/fixture-appointment');
  Object.assign(appointment.data, { visitType: 'synthetic-private-visit', visitMode: 'video', source: 'patient_portal', updatedAt: patient.data.updatedAt, slotIds: ['same-legacy-slot', 'another-slot', 'same-legacy-slot'], phoneKey: 'synthetic-private-phone-key', externalCalendar: { provider: 'google', eventId: 'synthetic-calendar-event', syncStatus: 'synced', lastSyncedAt: patient.data.updatedAt }, videoConsultation: { status: 'ready', joinUrl: 'https://example.test/private-room?token=synthetic-only', preparedBy: 'synthetic-staff', preparedAt: patient.data.updatedAt } });
  const event = records.find(row => row.path === 'appointments/fixture-appointment/events/fixture-event');
  Object.assign(event.data, { reason: 'Synthetic private event text', meta: { action: 'rescheduled', fromDateKey: '2026-10-19', toDateKey: '2026-10-20', toTime: '08:00' } });
  const options = { targetSnapshot, patientTargetSnapshot: { complete: true, patients: [] }, serviceTargetSnapshot: { complete: true, services: [] }, appointmentTargetSnapshot: { complete: true, appointments: [], events: [] } };
  const person = mapPatientRecord(patient, records, options.patientTargetSnapshot);
  const services = mapBookingConfig(config, records, options.serviceTargetSnapshot);
  const mapped = mapAppointmentRecord(appointment, records, options);
  const history = mapAppointmentRecord(event, records, options);
  assert.equal(mapped.status, 'mapped'); assert.equal(history.status, 'mapped');
  const insert = async (table, row) => {
    const columns = Object.keys(row).map(key => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`));
    await sql.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
  };
  await sql.query('BEGIN');
  try {
    await insert('clinic_patients', person.rows.patient);
    await insert('clinic_services', services.rows.services[0]);
    await insert('clinic_appointments', mapped.rows.appointment);
    await insert('clinic_appointment_private_details', mapped.rows.appointmentPrivateDetails);
    for (const row of mapped.rows.appointmentLegacySlots) await insert('clinic_appointment_legacy_slots', row);
    const payload = (await sql.query('SELECT snapshot_name, reason, video_join_url, calendar_event_id, legacy_slot_list_present FROM clinic_appointment_private_details WHERE appointment_id = $1', [mapped.rows.appointment.id])).rows[0];
    assert.deepEqual(payload, { snapshot_name: appointment.data.patientSnapshot.name, reason: appointment.data.reason, video_join_url: appointment.data.videoConsultation.joinUrl, calendar_event_id: 'synthetic-calendar-event', legacy_slot_list_present: true });
    const slots = (await sql.query('SELECT ordinal, legacy_slot_id FROM clinic_appointment_legacy_slots WHERE appointment_id = $1 ORDER BY ordinal', [mapped.rows.appointment.id])).rows;
    assert.deepEqual(slots, appointment.data.slotIds.map((id, ordinal) => ({ ordinal, legacy_slot_id: id })));
    assert.equal((await sql.query('SELECT count(*)::int AS n FROM clinic_patient_links WHERE patient_id = $1', [person.rows.patient.id])).rows[0].n, 0);
    await sql.query('SAVEPOINT missing_event_action');
    await assert.rejects(insert('clinic_appointment_events', history.rows.appointmentEvent), { code: '23502' });
    await sql.query('ROLLBACK TO SAVEPOINT missing_event_action');
    // Structural fixture only; no missing historical action is approved/inferred.
    await insert('clinic_appointment_events', { ...history.rows.appointmentEvent, action: 'synthetic_schema_check' });
    const stored = (await sql.query('SELECT legacy_reason, legacy_meta_action, legacy_to_date::text, legacy_to_time FROM clinic_appointment_events WHERE id = $1', [history.rows.appointmentEvent.id])).rows[0];
    assert.deepEqual(stored, { legacy_reason: event.data.reason, legacy_meta_action: 'rescheduled', legacy_to_date: '2026-10-20', legacy_to_time: '08:00' });
  } finally { await sql.query('ROLLBACK'); }
  const result = await clinic.executeQuery('GetPublicClinic', undefined, { impersonate: { unauthenticated: true } });
  assert.doesNotMatch(JSON.stringify(result.data), /Synthetic private|synthetic-only|snapshotName|videoJoinUrl|phoneKey/);
  for (const impersonate of [{ unauthenticated: true }, ...['patient', 'manager', 'doctor', 'admin'].map(role => ({ authClaims: { sub: `synthetic-${role}`, role } }))]) {
    for (const operation of ['ListAppointmentPrivateDetails', 'ListAppointmentLegacySlots', 'ListAppointmentHistory']) await assert.rejects(clinic.executeQuery(operation, undefined, { impersonate }), /not found/i);
  }
  await assert.rejects(sql.query('INSERT INTO clinic_appointment_private_details (appointment_id, legacy_slot_list_present) VALUES ($1, false)', [mapped.rows.appointment.id]), { code: '23503' });
});

test('counter/request evidence round-trips without allocation, active receipts or client access', async () => {
  const { fixtures, targetSnapshot, patientTargetSnapshot } = require('../migration/fixtures.cjs');
  const { mapAppointmentRecord, mapRegistryRecord } = require('../migration/rehearsal.cjs');
  const { prepareMigrationTimestamps } = require('../migration/instant-preservation.cjs');
  const records = structuredClone(fixtures);
  const appointment = records.find(row => row.path === 'appointments/fixture-appointment');
  Object.assign(appointment.data, { patientId: null, source: 'web', createdBy: { uid: null, role: 'public' }, updatedAt: appointment.data.createdAt });
  const counter = records.find(row => row.path === 'counters/patientUhid'); counter.data.value = Number.MAX_SAFE_INTEGER;
  const request = records.find(row => row.path.startsWith('bookingRequests/')); request.data.createdAt = '2026-10-19T00:00:00.123456789Z';
  const options = { targetSnapshot, patientTargetSnapshot, registryTargetSnapshot: { complete: true, counters: [], requests: [] } };
  const booking = mapAppointmentRecord(appointment, records, options);
  // Seeded service only for this structural fixture, not a historical mapping repair.
  booking.rows.appointment.serviceId = (await sql.query('SELECT id FROM clinic_services LIMIT 1')).rows[0].id;
  const c = prepareMigrationTimestamps(mapRegistryRecord(counter, records, options));
  const r = prepareMigrationTimestamps(mapRegistryRecord(request, records, options));
  assert.equal(c.status, 'prepared'); assert.equal(r.status, 'prepared');
  const insert = async (table, row) => {
    const columns = Object.keys(row).map(key => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`));
    return sql.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
  };
  const before = (await sql.query('SELECT (SELECT count(*) FROM clinic_patients)::int AS patients, (SELECT count(*) FROM clinic_operation_receipts)::int AS receipts')).rows[0];
  await sql.query('BEGIN');
  try {
    await insert('clinic_appointments', booking.rows.appointment);
    await insert('clinic_legacy_uhid_counters', c.rows.legacyUhidCounter);
    await insert('clinic_legacy_booking_requests', r.rows.legacyBookingRequest);
    for (const row of [...c.rows.legacySourceInstants, ...r.rows.legacySourceInstants]) await insert('clinic_legacy_source_instants', row);
    assert.equal((await sql.query('SELECT source_value FROM clinic_legacy_uhid_counters')).rows[0].source_value, '9007199254740991');
    assert.equal((await sql.query('SELECT legacy_request_key FROM clinic_legacy_booking_requests')).rows[0].legacy_request_key, request.path.split('/')[1]);
    assert.equal((await sql.query('SELECT exact_value FROM clinic_legacy_source_instants WHERE entity_id=$1 AND field=$2', [r.rows.legacyBookingRequest.id, 'createdAt'])).rows[0].exact_value, '2026-10-19T00:00:00.123456789Z');
    assert.deepEqual((await sql.query('SELECT (SELECT count(*) FROM clinic_patients)::int AS patients, (SELECT count(*) FROM clinic_operation_receipts)::int AS receipts')).rows[0], before);
    await sql.query('SAVEPOINT duplicate_request');
    await assert.rejects(insert('clinic_legacy_booking_requests', { ...r.rows.legacyBookingRequest, id: '00000000-0000-4000-8000-000000000099' }), { code: '23505' });
    await sql.query('ROLLBACK TO SAVEPOINT duplicate_request');
    await assert.rejects(sql.query('UPDATE clinic_legacy_booking_requests SET appointment_id=$1 WHERE id=$2', ['00000000-0000-4000-8000-000000000099', r.rows.legacyBookingRequest.id]), { code: '23503' });
  } finally { await sql.query('ROLLBACK'); }
  assert.equal((await sql.query('SELECT count(*)::int AS n FROM clinic_legacy_booking_requests')).rows[0].n, 0);
  assert.equal((await sql.query('SELECT count(*)::int AS n FROM clinic_legacy_uhid_counters')).rows[0].n, 0);
  for (const impersonate of [{ unauthenticated: true }, ...['patient', 'manager', 'doctor', 'admin'].map(role => ({ authClaims: { sub: `synthetic-registry-${role}`, role } }))]) {
    for (const operation of ['ListLegacyUhidCounters', 'ListLegacyBookingRequests']) await assert.rejects(clinic.executeQuery(operation, undefined, { impersonate }), /not found/i);
  }
});

test('legacy feedback/audit storage stays private, keeps exact history and never pollutes trusted audit', async () => {
  const { fixtures, targetSnapshot } = require('../migration/fixtures.cjs');
  const { mapPatientRecord, mapBookingConfig, mapAppointmentRecord, mapExperienceRecord } = require('../migration/rehearsal.cjs');
  const { prepareMigrationTimestamps } = require('../migration/instant-preservation.cjs');
  const records = structuredClone(fixtures);
  const patient = records.find(row => row.path === 'patients/fixture-account'); patient.data.createdAt = patient.data.updatedAt;
  const config = records.find(row => row.path === 'clinic/publicConfig');
  // Synthetic structural fixture only; migration never fills missing source dates.
  config.data.createdAt = config.data.updatedAt = patient.data.updatedAt;
  Object.assign(config.data.visitTypes[0], { id: 'synthetic-feedback-visit', active: true });
  const appointment = records.find(row => row.path === 'appointments/fixture-appointment');
  Object.assign(appointment.data, { visitType: 'synthetic-feedback-visit', status: 'completed', source: 'patient_portal', updatedAt: patient.data.updatedAt });
  const feedback = records.find(row => row.path.startsWith('patientFeedback/'));
  Object.assign(feedback.data, { status: 'published', reviewedBy: 'synthetic-reviewer', reviewedAt: '2026-10-19T00:00:00.123456789Z', publishedAt: '2026-10-19T00:00:00.123456789Z' });
  const audit = records.find(row => row.path.startsWith('auditLogs/'));
  Object.assign(audit.data, { actor: { uid: null, role: 'public' }, meta: { active: false, count: 0, fields: [] }, at: '2026-10-19T00:00:00.123456789Z' });
  const options = { targetSnapshot, patientTargetSnapshot: { complete: true, patients: [] }, serviceTargetSnapshot: { complete: true, services: [] }, appointmentTargetSnapshot: { complete: true, appointments: [], events: [] }, experienceTargetSnapshot: { complete: true, feedback: [], audit: [] } };
  const person = mapPatientRecord(patient, records, options.patientTargetSnapshot);
  const services = mapBookingConfig(config, records, options.serviceTargetSnapshot);
  const booking = mapAppointmentRecord(appointment, records, options);
  const f = prepareMigrationTimestamps(mapExperienceRecord(feedback, records, options));
  const a = prepareMigrationTimestamps(mapExperienceRecord(audit, records, options));
  assert.equal(f.status, 'prepared'); assert.equal(a.status, 'prepared');
  const insert = async (table, row) => {
    const columns = Object.keys(row).map(key => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`));
    return sql.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
  };
  const auditBefore = (await sql.query('SELECT count(*)::int AS n FROM clinic_audit_logs')).rows[0].n;
  await sql.query('BEGIN');
  try {
    await insert('clinic_patients', person.rows.patient);
    await insert('clinic_services', services.rows.services[0]);
    await insert('clinic_appointments', booking.rows.appointment);
    await insert('clinic_legacy_patient_feedback', f.rows.legacyPatientFeedback);
    await insert('clinic_legacy_audit_records', a.rows.legacyAuditRecord);
    for (const row of [...f.rows.legacySourceInstants, ...a.rows.legacySourceInstants]) await insert('clinic_legacy_source_instants', row);
    const stored = (await sql.query('SELECT status, comment, reviewed_by FROM clinic_legacy_patient_feedback WHERE id=$1', [f.rows.legacyPatientFeedback.id])).rows[0];
    assert.deepEqual(stored, { status: 'published', comment: feedback.data.comment, reviewed_by: 'synthetic-reviewer' });
    const legacy = (await sql.query('SELECT actor_uid, actor_role, legacy_metadata FROM clinic_legacy_audit_records WHERE id=$1', [a.rows.legacyAuditRecord.id])).rows[0];
    assert.equal(legacy.actor_uid, null); assert.equal(legacy.actor_role, 'public'); assert.deepEqual(JSON.parse(legacy.legacy_metadata), audit.data.meta);
    assert.equal((await sql.query('SELECT exact_value FROM clinic_legacy_source_instants WHERE entity_id=$1 AND field=$2', [f.rows.legacyPatientFeedback.id, 'publishedAt'])).rows[0].exact_value, '2026-10-19T00:00:00.123456789Z');
    assert.equal((await sql.query('SELECT count(*)::int AS n FROM clinic_audit_logs')).rows[0].n, auditBefore);
    await sql.query('SAVEPOINT duplicate_feedback');
    await assert.rejects(insert('clinic_legacy_patient_feedback', { ...f.rows.legacyPatientFeedback, id: '00000000-0000-4000-8000-000000000099', legacyId: 'patientFeedback/other' }), { code: '23505' });
    await sql.query('ROLLBACK TO SAVEPOINT duplicate_feedback');
    await assert.rejects(sql.query('UPDATE clinic_legacy_patient_feedback SET patient_id=$1 WHERE id=$2', ['00000000-0000-4000-8000-000000000099', f.rows.legacyPatientFeedback.id]), { code: '23503' });
  } finally { await sql.query('ROLLBACK'); }
  assert.equal((await sql.query('SELECT count(*)::int AS n FROM clinic_legacy_patient_feedback')).rows[0].n, 0);
  for (const impersonate of [{ unauthenticated: true }, ...['patient', 'manager', 'doctor', 'admin'].map(role => ({ authClaims: { sub: `synthetic-history-${role}`, role } }))]) {
    for (const operation of ['ListLegacyPatientFeedback', 'ListLegacyAuditRecords']) await assert.rejects(clinic.executeQuery(operation, undefined, { impersonate }), /not found/i);
  }
  assert.doesNotMatch(JSON.stringify((await clinic.executeQuery('GetPublicClinic', undefined, { impersonate: { unauthenticated: true } })).data), /Synthetic unpublished feedback|legacyMetadata|reviewedBy/);
});

test('legacy clinical drafts preserve private history/document metadata, exact evidence and relational constraints', async () => {
  const { fixtures, targetSnapshot } = require('../migration/fixtures.cjs');
  const { mapPatientRecord, mapClinicalRecord } = require('../migration/rehearsal.cjs');
  const { prepareMigrationTimestamps } = require('../migration/instant-preservation.cjs');
  const records = structuredClone(fixtures);
  const patient = records.find(row => row.path === 'patients/fixture-account');
  patient.data.createdAt = patient.data.updatedAt;
  const history = records.find(row => row.path.includes('/medicalHistory/'));
  Object.assign(history.data, { details: 'Synthetic private history details', createdAt: '2026-10-19T00:00:00.123456789Z' });
  const document = records.find(row => row.path.includes('/medicalDocuments/'));
  Object.assign(document.data, { category: 'Report', details: 'Synthetic private document details', url: 'https://example.test/file?token=synthetic-only', size: 1234, contentType: 'application/pdf' });
  const options = { targetSnapshot, patientTargetSnapshot: { complete: true, patients: [] }, clinicalTargetSnapshot: { complete: true, histories: [], documents: [] } };
  const person = mapPatientRecord(patient, records, options.patientTargetSnapshot);
  const h = prepareMigrationTimestamps(mapClinicalRecord(history, records, options));
  const d = prepareMigrationTimestamps(mapClinicalRecord(document, records, options));
  assert.equal(h.status, 'prepared'); assert.equal(d.status, 'prepared');
  const insert = async (table, row) => {
    const columns = Object.keys(row).map(key => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`));
    return sql.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
  };
  await sql.query('BEGIN');
  try {
    await insert('clinic_patients', person.rows.patient);
    await insert('clinic_legacy_medical_history', h.rows.legacyMedicalHistory);
    await insert('clinic_legacy_medical_documents', d.rows.legacyMedicalDocument);
    for (const evidence of [...h.rows.legacySourceInstants, ...d.rows.legacySourceInstants]) await insert('clinic_legacy_source_instants', evidence);
    const storedHistory = (await sql.query(`SELECT diagnosis, details, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS instant FROM clinic_legacy_medical_history WHERE id=$1`, [h.rows.legacyMedicalHistory.id])).rows[0];
    assert.deepEqual(storedHistory, { diagnosis: history.data.diagnosis, details: history.data.details, instant: '2026-10-19T00:00:00.123456Z' });
    assert.equal((await sql.query('SELECT exact_value FROM clinic_legacy_source_instants WHERE entity_id=$1', [h.rows.legacyMedicalHistory.id])).rows[0].exact_value, '2026-10-19T00:00:00.123456789Z');
    const storedDocument = (await sql.query('SELECT legacy_url, details, visible_to_patient, size_bytes FROM clinic_legacy_medical_documents WHERE id=$1', [d.rows.legacyMedicalDocument.id])).rows[0];
    assert.deepEqual(storedDocument, { legacy_url: document.data.url, details: document.data.details, visible_to_patient: false, size_bytes: 1234 });
    assert.equal((await sql.query('SELECT count(*)::int AS n FROM clinic_patient_links WHERE patient_id=$1', [person.rows.patient.id])).rows[0].n, 0);
    await sql.query('SAVEPOINT duplicate_clinical_identity');
    await assert.rejects(insert('clinic_legacy_medical_documents', { ...d.rows.legacyMedicalDocument, id: '00000000-0000-4000-8000-000000000099' }), { code: '23505' });
    await sql.query('ROLLBACK TO SAVEPOINT duplicate_clinical_identity');
    await assert.rejects(sql.query('UPDATE clinic_legacy_medical_history SET doctor_id=$1 WHERE id=$2', ['00000000-0000-4000-8000-000000000099', h.rows.legacyMedicalHistory.id]), { code: '23503' });
  } finally { await sql.query('ROLLBACK'); }
  assert.equal((await sql.query('SELECT count(*)::int AS n FROM clinic_legacy_medical_documents')).rows[0].n, 0);
  assert.equal((await sql.query('SELECT count(*)::int AS n FROM clinic_legacy_medical_history')).rows[0].n, 0);
  for (const impersonate of [{ unauthenticated: true }, ...['patient', 'manager', 'doctor', 'admin'].map(role => ({ authClaims: { sub: `synthetic-clinical-${role}`, role } }))]) {
    for (const operation of ['ListLegacyMedicalHistory', 'ListLegacyMedicalDocuments']) await assert.rejects(clinic.executeQuery(operation, undefined, { impersonate }), /not found/i);
  }
  const result = await clinic.executeQuery('GetPublicClinic', undefined, { impersonate: { unauthenticated: true } });
  assert.doesNotMatch(JSON.stringify(result.data), /Synthetic private|synthetic-only|legacyUrl|diagnosis/);
});

test('anonymous appointment draft stores private contact with NULL patient, keeps FK integrity and grants no access', async () => {
  const { fixtures, targetSnapshot } = require('../migration/fixtures.cjs');
  const { mapAppointmentRecord } = require('../migration/rehearsal.cjs');
  const records = structuredClone(fixtures);
  const source = records.find(row => row.path === 'appointments/fixture-appointment');
  Object.assign(source.data, { patientId: null, source: 'web', createdBy: { uid: null, role: 'public' }, updatedAt: source.data.createdAt });
  const result = mapAppointmentRecord(source, records, { targetSnapshot });
  assert.equal(result.status, 'mapped');
  const row = result.rows.appointment;
  // The existing seeded service is used only for this structural storage test.
  row.serviceId = (await sql.query('SELECT id FROM clinic_services LIMIT 1')).rows[0].id;
  const insert = async (table, value) => {
    const columns = Object.keys(value).map(key => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`));
    return sql.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(value));
  };
  const patientsBefore = (await sql.query('SELECT count(*)::int AS n FROM clinic_patients')).rows[0].n;
  const linksBefore = (await sql.query('SELECT count(*)::int AS n FROM clinic_patient_links')).rows[0].n;
  await sql.query('BEGIN');
  try {
    await insert('clinic_appointments', row);
    await insert('clinic_appointment_private_details', result.rows.appointmentPrivateDetails);
    const stored = (await sql.query('SELECT a.patient_id, a.created_by_uid, d.snapshot_name, d.snapshot_phone FROM clinic_appointments a JOIN clinic_appointment_private_details d ON d.appointment_id = a.id WHERE a.id = $1', [row.id])).rows[0];
    assert.deepEqual(stored, { patient_id: null, created_by_uid: null, snapshot_name: source.data.patientSnapshot.name, snapshot_phone: source.data.patientSnapshot.phone });
    assert.equal((await sql.query('SELECT count(*)::int AS n FROM clinic_patients')).rows[0].n, patientsBefore);
    assert.equal((await sql.query('SELECT count(*)::int AS n FROM clinic_patient_links')).rows[0].n, linksBefore);
    // A non-NULL patient still must exist; NULL is not a dangling-reference bypass.
    await assert.rejects(sql.query('UPDATE clinic_appointments SET patient_id = $1 WHERE id = $2', ['00000000-0000-4000-8000-000000000099', row.id]), { code: '23503' });
  } finally { await sql.query('ROLLBACK'); }
  assert.equal((await sql.query('SELECT count(*)::int AS n FROM clinic_appointments WHERE id = $1', [row.id])).rows[0].n, 0);
  for (const impersonate of [{ unauthenticated: true }, ...['patient', 'manager', 'doctor', 'admin'].map(role => ({ authClaims: { sub: `synthetic-guest-${role}`, role } }))]) {
    for (const operation of ['ListAppointments', 'ListGuestAppointments', 'ListAppointmentPrivateDetails']) await assert.rejects(clinic.executeQuery(operation, undefined, { impersonate }), /not found/i);
  }
  const publicResult = await clinic.executeQuery('GetPublicClinic', undefined, { impersonate: { unauthenticated: true } });
  assert.doesNotMatch(JSON.stringify(publicResult.data), /snapshotPhone|snapshotName|fixture@example.test|Synthetic Patient/);
});

test('schedule candidates round-trip explicit closures, ordered windows and private exception provenance', async () => {
  const { fixtures, targetSnapshot } = require('../migration/fixtures.cjs');
  const { mapScheduleRecord } = require('../migration/rehearsal.cjs');
  const weekly = structuredClone(fixtures.find(row => row.path === 'doctorSchedules/fixture-doctor'));
  const exception = structuredClone(fixtures.find(row => row.path === 'scheduleExceptions/fixture-exception'));
  weekly.data.sessions = [];
  weekly.data.updatedBy = 'synthetic-schedule-author';
  Object.assign(exception.data, { type: 'replace', sessions: [{ start: '17:00', end: '18:00' }, { start: '08:00', end: '09:00' }], note: '', reason: 'Synthetic private closure reason', createdBy: 'synthetic-author', createdAt: '2026-10-19T00:00:00.123456Z' });
  const records = fixtures.filter(row => ![weekly.path, exception.path].includes(row.path)).concat(weekly, exception);
  const options = { targetSnapshot, scheduleTargetSnapshot: { complete: true, states: [], weekly: [], exceptions: [], windows: [] } };
  const hours = mapScheduleRecord(weekly, records, options);
  const day = mapScheduleRecord(exception, records, options);
  assert.equal(hours.status, 'mapped'); assert.equal(day.status, 'mapped');
  const insert = async (table, row) => {
    const columns = Object.keys(row).map(key => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`));
    await sql.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
  };
  await sql.query('BEGIN');
  try {
    await insert('clinic_doctor_schedule_states', hours.rows.scheduleState);
    assert.equal(hours.rows.doctorSchedules.length, 0);
    await insert('clinic_schedule_exceptions', day.rows.scheduleException);
    for (const row of day.rows.exceptionWindows) await insert('clinic_exception_windows', row);
    const state = (await sql.query('SELECT authority, legacy_source_path, legacy_updated_by FROM clinic_doctor_schedule_states WHERE doctor_id = $1', [targetSnapshot.doctors[0].id])).rows[0];
    assert.deepEqual(state, { authority: 'doctor_schedule', legacy_source_path: weekly.path, legacy_updated_by: weekly.data.updatedBy });
    assert.equal((await sql.query('SELECT count(*)::int AS n FROM clinic_doctor_schedules WHERE doctor_id = $1', [targetSnapshot.doctors[0].id])).rows[0].n, 0);
    const open = mapScheduleRecord(fixtures.find(row => row.path === weekly.path), fixtures, options);
    await insert('clinic_doctor_schedules', open.rows.doctorSchedules[0]);
    const regular = (await sql.query('SELECT weekday, start_minute, end_minute, source_order, legacy_id FROM clinic_doctor_schedules WHERE id = $1', [open.rows.doctorSchedules[0].id])).rows[0];
    assert.deepEqual(regular, { weekday: 1, start_minute: 480, end_minute: 600, source_order: 0, legacy_id: `${weekly.path}/sessions/0` });
    const stored = (await sql.query('SELECT kind, public_note, legacy_note, legacy_reason, legacy_created_by FROM clinic_schedule_exceptions WHERE id = $1', [day.rows.scheduleException.id])).rows[0];
    assert.deepEqual(stored, { kind: 'replace', public_note: null, legacy_note: '', legacy_reason: exception.data.reason, legacy_created_by: exception.data.createdBy });
    const windows = (await sql.query('SELECT start_minute, end_minute, source_order FROM clinic_exception_windows WHERE exception_id = $1 ORDER BY source_order', [day.rows.scheduleException.id])).rows;
    assert.deepEqual(windows, [{ start_minute: 1020, end_minute: 1080, source_order: 0 }, { start_minute: 480, end_minute: 540, source_order: 1 }]);
    await assert.rejects(sql.query('INSERT INTO clinic_doctor_schedule_states (doctor_id, authority) VALUES ($1, $2)', ['00000000-0000-4000-8000-000000000099', 'doctor_schedule']), { code: '23503' });
  } finally { await sql.query('ROLLBACK'); }
  const publicResult = await clinic.executeQuery('GetPublicClinic', undefined, { impersonate: { unauthenticated: true } });
  assert.doesNotMatch(JSON.stringify(publicResult.data), /Synthetic private|legacyReason|legacyNote|synthetic-author/);
  for (const impersonate of [{ unauthenticated: true }, { authClaims: { sub: 'synthetic-patient' } }, { authClaims: { sub: 'synthetic-manager', role: 'manager' } }]) {
    await assert.rejects(clinic.executeQuery('ListLegacyScheduleMetadata', undefined, { impersonate }), /not found/i);
  }
});

test('booking config draft round-trips service identity, ordering and separate private buffers', async () => {
  const { fixtures } = require('../migration/fixtures.cjs');
  const { mapBookingConfig } = require('../migration/rehearsal.cjs');
  const source = structuredClone(fixtures.find(row => row.path === 'clinic/publicConfig'));
  Object.assign(source.data, { slotMinutes: 20, intervalMinutes: 10, bufferBeforeMinutes: 5, bufferAfterMinutes: 15, autoConfirm: false, patientCancellationCutoffHours: 0, createdAt: '2026-10-19T00:00:00.123456Z', updatedAt: '2026-10-19T00:00:00.123456Z', updatedBy: 'synthetic-operator' });
  source.data.visitTypes[0].active = false;
  source.data.visitTypes[0].id = 'synthetic-consultation';
  const mapped = mapBookingConfig(source, [source], { complete: true, services: [] });
  assert.equal(mapped.status, 'mapped');
  const insert = async (table, row) => {
    const columns = Object.keys(row).map(key => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`));
    await sql.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
  };
  await sql.query('BEGIN');
  try {
    await insert('clinic_settings', { ...mapped.rows.clinicSettings, id: 'synthetic-config' });
    await insert('clinic_services', mapped.rows.services[0]);
    const settings = (await sql.query("SELECT slot_minutes, interval_minutes, buffer_before_minutes, buffer_after_minutes, cancel_cutoff_minutes, auto_confirm, legacy_updated_by, to_char(updated_at, 'SS.US') AS precision FROM clinic_settings WHERE id = 'synthetic-config'")).rows[0];
    assert.deepEqual(settings, { slot_minutes: 20, interval_minutes: 10, buffer_before_minutes: 5, buffer_after_minutes: 15, cancel_cutoff_minutes: 0, auto_confirm: false, legacy_updated_by: 'synthetic-operator', precision: '00.123456' });
    const service = (await sql.query('SELECT legacy_id, legacy_sort_order, active, fee_paise FROM clinic_services WHERE id = $1', [mapped.rows.services[0].id])).rows[0];
    assert.deepEqual(service, { legacy_id: 'synthetic-consultation', legacy_sort_order: 0, active: false, fee_paise: 25000 });
    await assert.rejects(sql.query('INSERT INTO clinic_services (code, name, duration_minutes, consultation_mode, updated_at, legacy_id) VALUES ($1, $2, 20, $3, now(), $4)', ['different-code', 'Synthetic service', 'video', 'synthetic-consultation']), { code: '23505' });
  } finally { await sql.query('ROLLBACK'); }
  const publicResult = await clinic.executeQuery('GetPublicClinic', undefined, { impersonate: { unauthenticated: true } });
  assert.doesNotMatch(JSON.stringify(publicResult.data), /bufferBefore|bufferAfter|legacyUpdatedBy|legacySortOrder|synthetic-operator/);
});

test('patient migration draft round-trips demographics separately from inaccessible health text', async () => {
  const { fixtures } = require('../migration/fixtures.cjs');
  const { mapPatientRecord } = require('../migration/rehearsal.cjs');
  const source = structuredClone(fixtures.find(row => row.path === 'patients/fixture-account'));
  source.data.createdAt = source.data.updatedAt;
  source.data.maritalStatus = '';
  source.data.emergencyContactName = 'Synthetic emergency contact';
  source.data.emergencyContactPhone = '';
  source.data.currentMedications = '';
  source.data.healthNotes = 'Synthetic private health text';
  source.data.createdBy = 'synthetic-clerk';
  const mapped = mapPatientRecord(source, [source], { complete: true, patients: [] });
  assert.equal(mapped.status, 'mapped');
  const insert = async (table, row) => {
    const columns = Object.keys(row).map(key => key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`));
    // Identifiers come only from the fixed mapper, values are bound parameters.
    await sql.query(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(',')})`, Object.values(row));
  };
  await sql.query('BEGIN');
  try {
    await insert('clinic_patients', mapped.rows.patient);
    await insert('clinic_patient_reported_profiles', mapped.rows.patientReportedProfile);
    const demographics = (await sql.query('SELECT title, marital_status, address_line1, emergency_contact_name, emergency_contact_phone, legacy_created_by, date_of_birth::text FROM clinic_patients WHERE id = $1', [mapped.rows.patient.id])).rows[0];
    assert.equal(demographics.marital_status, '');
    assert.equal(demographics.address_line1, source.data.addressLine1);
    assert.equal(demographics.emergency_contact_phone, '');
    assert.equal(demographics.legacy_created_by, source.data.createdBy);
    assert.equal(demographics.date_of_birth, '2000-02-29');
    const staffSource = structuredClone(source);
    staffSource.path = 'patients/synthetic-staff-created';
    Object.assign(staffSource.data, { uhid: 'SC-000003', recordSource: 'staff', linkedUids: [], createdBy: { uid: 'synthetic-staff', role: 'manager' }, updatedBy: 'synthetic-updater' });
    const staffCandidate = mapPatientRecord(staffSource, [staffSource], { complete: true, patients: [] });
    assert.equal(staffCandidate.status, 'mapped');
    await insert('clinic_patients', staffCandidate.rows.patient);
    const provenance = (await sql.query('SELECT legacy_created_by, legacy_created_by_uid, legacy_created_by_role, legacy_updated_by FROM clinic_patients WHERE id=$1', [staffCandidate.rows.patient.id])).rows[0];
    assert.deepEqual(provenance, { legacy_created_by: null, legacy_created_by_uid: 'synthetic-staff', legacy_created_by_role: 'manager', legacy_updated_by: 'synthetic-updater' });
    assert.equal((await sql.query('SELECT count(*)::int AS n FROM clinic_patient_links WHERE patient_id=$1', [staffCandidate.rows.patient.id])).rows[0].n, 0);
    const health = (await sql.query('SELECT allergies, current_medications, health_notes FROM clinic_patient_reported_profiles WHERE patient_id = $1', [mapped.rows.patient.id])).rows[0];
    assert.equal(health.health_notes, source.data.healthNotes);
    assert.equal(health.current_medications, '');
    assert.equal((await sql.query('SELECT count(*)::int AS n FROM clinic_patient_links WHERE patient_id = $1', [mapped.rows.patient.id])).rows[0].n, 0);
  } finally { await sql.query('ROLLBACK'); }
  // PGlite shares a session; connector queries must not nest in a raw transaction.
  const publicResult = await clinic.executeQuery('GetPublicClinic', undefined, { impersonate: { unauthenticated: true } });
  assert.doesNotMatch(JSON.stringify(publicResult.data), /Synthetic private|Synthetic Patient|SC-999999|allergies|healthNotes|emergencyContact|synthetic-staff|legacyCreatedBy/);
  for (const impersonate of [{ unauthenticated: true }, { authClaims: { sub: 'fixture-account' } }, { authClaims: { sub: 'fixture-manager', role: 'manager' } }, { authClaims: { sub: 'fixture-doctor', role: 'doctor' } }]) {
    await assert.rejects(clinic.executeQuery('ListPatientReportedProfiles', undefined, { impersonate }), /not found/i);
  }
  await assert.rejects(sql.query('INSERT INTO clinic_patient_reported_profiles (patient_id, allergies) VALUES ($1, $2)', [mapped.rows.patient.id, 'Synthetic']), { code: '23503' });
});









async function linkingFixture(suffix, staffUid = 'sql-lifecycle-administrator') {
  const { getAuth } = functionsRequire('firebase-admin/auth');
  const { createPatientLinking, sqlPatientLinkStore } = require('../../functions/lib/patientLinking');
  const auth = getAuth(admin.app);
  const uid = `sql-link-${suffix}`;
  const patientId = `40000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
  await auth.createUser({ uid, email: `link-${suffix}@example.test`, emailVerified: true });
  await sql.query('INSERT INTO clinic_users (id, display_name, active, created_at, updated_at) VALUES ($1, $2, true, now(), now())', [uid, 'Synthetic account']);
  await sql.query('INSERT INTO clinic_patients (id, uhid, display_name, phone, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now())', [patientId, `TEST-LINK-${suffix}`, 'Synthetic patient', '0000000000']);
  const service = createPatientLinking({ auth, store: sqlPatientLinkStore(admin) });
  const staff = (data) => ({ auth: { uid: staffUid, token: { role: 'admin', auth_time: Math.floor(Date.now() / 1000) } }, data });
  const accept = (code, targetUid = uid) => service.accept({ auth: { uid: targetUid, token: { email_verified: true, auth_time: Math.floor(Date.now() / 1000) } }, data: { code } });
  const issue = (relationship = 'self', evidence = 'in_person_identity') => service.issue(staff({ patientId, targetUid: uid, relationship, evidence }));
  const revoke = () => service.revoke(staff({ patientId, targetUid: uid }));
  return { uid, patientId, issue, accept, revoke, service, auth };
}








test('normalized catalog columns retain source fields without exposing provenance in public queries', async () => {
  assert.equal((await sql.query("SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='clinic_doctor_departments' AND column_name='sort_order'")).rows[0].is_nullable, 'YES');
  await sql.query("UPDATE clinic_branches SET address_line1='Synthetic line', address_line2='', city='Synthetic city', state='Synthetic state', postal_code='000000', country='IN', legacy_updated_by='fixture-source-author' WHERE code='SOOD'");
  await sql.query("UPDATE clinic_departments SET description='Synthetic retained description', created_at='2026-10-19T00:00:00Z', legacy_updated_by='fixture-source-author' WHERE code='GASTRO'");
  await sql.query("UPDATE clinic_doctors SET created_at='2026-10-19T00:00:00Z', legacy_updated_by='fixture-source-author' WHERE registration_number='HR886'");
  await sql.query('UPDATE clinic_doctor_departments SET sort_order=2');
  try {
    const branch = (await sql.query("SELECT address_line1, address_line2, city, state, postal_code, country, legacy_updated_by FROM clinic_branches WHERE code='SOOD'")).rows[0];
    assert.deepEqual(branch, { address_line1: 'Synthetic line', address_line2: '', city: 'Synthetic city', state: 'Synthetic state', postal_code: '000000', country: 'IN', legacy_updated_by: 'fixture-source-author' });
    assert.equal((await sql.query("SELECT description FROM clinic_departments WHERE code='GASTRO'")).rows[0].description, 'Synthetic retained description');
    assert.equal((await sql.query('SELECT sort_order FROM clinic_doctor_departments')).rows[0].sort_order, 2);
    const publicResult = await clinic.executeQuery('GetPublicClinic', undefined, { impersonate: { unauthenticated: true } });
    assert.doesNotMatch(JSON.stringify(publicResult.data), /fixture-source-author|legacyUpdatedBy|Synthetic retained description/);
    const precision = (await sql.query("SELECT to_char('2026-10-19T00:00:00.123456789Z'::timestamptz AT TIME ZONE 'UTC', 'US') AS fractional")).rows[0].fractional;
    assert.equal(precision, '123457');
  } finally {
    await sql.query("UPDATE clinic_branches SET address_line1=NULL, address_line2=NULL, city=NULL, state=NULL, postal_code=NULL, country=NULL, legacy_updated_by=NULL WHERE code='SOOD'");
    await sql.query("UPDATE clinic_departments SET description=NULL, created_at=NULL, legacy_updated_by=NULL WHERE code='GASTRO'");
    await sql.query("UPDATE clinic_doctors SET created_at=NULL, legacy_updated_by=NULL WHERE registration_number='HR886'");
    await sql.query('UPDATE clinic_doctor_departments SET sort_order=0');
  }
});

async function staffRegistryFixture(suffix, run) {
  const { getAuth } = functionsRequire('firebase-admin/auth');
  const auth = getAuth(admin.app);
  const uid = `sql-staff-registry-${suffix}`;
  await auth.createUser({ uid, emailVerified: true });
  await auth.setCustomUserClaims(uid, { role: 'admin' });
  const { createSqlPatientProfiles, sqlPatientProfileStore } = require('../../functions/lib/sqlPatientProfiles');
  const store = sqlPatientProfileStore(admin);
  const api = createSqlPatientProfiles({ auth, store });
  const patientId = `70000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
  const uhid = `SYN-REG-${suffix}`;
  const patientPhone = '+919876500000';
  await sql.query('INSERT INTO clinic_patients(id,uhid,display_name,phone,created_at,updated_at) VALUES($1,$2,$3,$4,now(),now())', [patientId, uhid, 'Synthetic registry patient', patientPhone]);
  const request = (data, role = 'admin') => ({ auth: { uid, token: { role, auth_time: Math.floor(Date.now() / 1000) + 1 } }, data });
  const search = (input, role) => api.searchStaff(request(input, role));
  const readStaff = (role) => api.getStaff(request({ patientId }, role));
  const saveStaff = async (patch = {}, snapshot, requestId = randomUUID(), role) => {
    const current = snapshot || await readStaff(role);
    return api.saveStaff(request({ patientId, requestId, expectedUpdatedAt: current.profile.updatedAt, profile: { displayName: 'Synthetic Registry Edit', phone: '+919876543210', title: 'Mr.', gender: 'Male', maritalStatus: 'Single', ...patch } }, role));
  };
  try { await run({ auth, uid, store, api, request, search, readStaff, saveStaff, patientId, uhid, patientPhone }); }
  finally {
    await sql.query('ROLLBACK');
    await sql.query('DELETE FROM clinic_patient_reported_profiles WHERE patient_id=$1', [patientId]);
    await sql.query('DELETE FROM clinic_patient_links WHERE patient_id=$1', [patientId]);
    await sql.query('DELETE FROM clinic_patients WHERE id=$1', [patientId]);
    await sql.query('DELETE FROM clinic_operation_receipts WHERE actor_uid=$1', [uid]);
    await sql.query('DELETE FROM clinic_audit_logs WHERE actor_uid=$1', [uid]);
    await auth.deleteUser(uid);
  }
}

test('SQL staff registry search returns exact bounded matches with ID-only audits and term-free access evidence', async () => staffRegistryFixture(71, async ({ search, readStaff, saveStaff, patientId, uhid, patientPhone, uid }) => {
  const byUhid = await search({ uhid: `  ${uhid}  ` });
  assert.deepEqual(byUhid.patients, [{ patientId, uhid, displayName: 'Synthetic registry patient', phone: patientPhone }]);
  const byPhone = await search({ phone: patientPhone.slice(3) });
  assert.deepEqual(byPhone.patients.map(row => row.patientId), [patientId]);
  assert.deepEqual((await search({ uhid: uhid.slice(0, -1) })).patients, []);
  assert.deepEqual((await search({ phone: '+919876500001' })).patients, []);
  for (const input of [{ displayName: 'Synthetic' }, { email: 'private@example.test' }, { uhid: 'SYN-*' }]) {
    await assert.rejects(search(input), error => error.code === 'invalid-argument');
  }
  const profile = (await readStaff()).profile;
  assert.equal(Object.hasOwn(profile, 'relationship'), false);
  for (const field of ['email', 'healthNotes', 'bloodGroup', 'legacyCreatedByUid', 'archivedAt']) assert.equal(Object.hasOwn(profile, field), false);
  await saveStaff({ city: 'Synthetic city' });
  const audits = (await sql.query('SELECT actor_role, action, resource_type, resource_id FROM clinic_audit_logs WHERE actor_uid=$1 ORDER BY action', [uid])).rows;
  assert.equal(audits.filter(row => row.action === 'patient_registry_searched').length, 4);
  // Every ReadStaffPatientDemographics execution is audited: the explicit read, the save helper's
  // snapshot read and the versioned save's in-transaction access recheck.
  assert.equal(audits.filter(row => row.action === 'patient_demographics_viewed').length, 3);
  assert.equal(audits.filter(row => row.action === 'staff_patient_demographics_saved').length, 1);
  // UUID-typed variables are stored in PostgreSQL's canonical hyphenless form.
  for (const row of audits.filter(row => row.action !== 'staff_patient_demographics_saved')) assert.equal(row.resource_id, row.action === 'patient_registry_searched' ? 'registry' : patientId.replaceAll('-', ''));
  for (const row of audits.filter(row => row.action === 'staff_patient_demographics_saved')) assert.deepEqual([row.actor_role, row.resource_id], ['admin', patientId.replaceAll('-', '')]);
  assert.equal(JSON.stringify(audits).includes(uhid), false);
  assert.equal(JSON.stringify(audits).includes(patientPhone), false);
  assert.equal(JSON.stringify(audits).includes('Synthetic'), false);
}));

test('SQL staff search bounds the 21-row sentinel, excludes archived patients and fails closed on malformed rows', async () => staffRegistryFixture(72, async ({ search, readStaff, patientId, uhid }) => {
  const boundPhone = '+919876500099';
  try {
    await sql.query("INSERT INTO clinic_patients(id,uhid,display_name,phone,created_at,updated_at) SELECT gen_random_uuid(),'SYN-REG-BOUND-'||n,'Synthetic bound '||n,$1,now(),now() FROM generate_series(1,21) n", [boundPhone]);
    await assert.rejects(search({ phone: boundPhone }), error => error.code === 'failed-precondition');
    await sql.query("UPDATE clinic_patients SET archived_at=now() WHERE uhid='SYN-REG-BOUND-21'");
    const bounded = await search({ phone: boundPhone });
    assert.equal(bounded.patients.length, 20);
    assert.equal(bounded.patients.some(row => row.uhid === 'SYN-REG-BOUND-21'), false);
    await sql.query('UPDATE clinic_patients SET archived_at=now() WHERE id=$1', [patientId]);
    assert.deepEqual((await search({ uhid })).patients, []);
    await assert.rejects(readStaff(), error => error.code === 'not-found');
    await sql.query('UPDATE clinic_patients SET archived_at=null WHERE id=$1', [patientId]);
    await sql.query("UPDATE clinic_patients SET display_name=' ' WHERE uhid='SYN-REG-BOUND-1'");
    await assert.rejects(search({ phone: boundPhone }), error => error.code === 'failed-precondition');
  } finally { await sql.query("DELETE FROM clinic_patients WHERE uhid LIKE 'SYN-REG-BOUND-%'"); }
}));

test('SQL staff demographic saves preserve health/blood/UHID/Auth/link state and race one CAS winner per revision', async () => staffRegistryFixture(73, async ({ auth, api, store, saveStaff, readStaff, patientId, uid }) => {
  await sql.query("UPDATE clinic_patients SET email='private@example.test',legacy_created_by_uid='private-actor',blood_group='AB+' WHERE id=$1", [patientId]);
  await sql.query("INSERT INTO clinic_patient_reported_profiles(patient_id,health_notes) VALUES($1,'Private synthetic health')", [patientId]);
  const linked = 'sql-staff-registry-link-73';
  try {
    const patientUid = 'sql-staff-registry-patient-73';
    await sql.query("INSERT INTO clinic_users (id, display_name, active, created_at, updated_at) VALUES ($1, 'Synthetic linked account', true, now(), now())", [linked]);
    await sql.query("INSERT INTO clinic_patient_links(patient_id,user_id,relationship,verified_at,verified_by,created_at) VALUES($1,$2,'self',now(),'synthetic-verification',now())", [patientId, linked]);
    await auth.createUser({ uid: patientUid, emailVerified: true });
    await sql.query("INSERT INTO clinic_users (id, display_name, active, created_at, updated_at) VALUES ($1, 'Synthetic patient account', true, now(), now())", [patientUid]);
    await sql.query("INSERT INTO clinic_patient_links(patient_id,user_id,relationship,verified_at,verified_by,created_at) VALUES($1,$2,'self',now(),'synthetic-verification',now())", [patientId, patientUid]);
    const patientRequest = data => ({ auth: { uid: patientUid, token: { email_verified: true, auth_time: Math.floor(Date.now() / 1000) } }, data });
    const before = await readStaff();
    await saveStaff({ city: 'Synthetic city' });
    assert.deepEqual((await sql.query('SELECT email,legacy_created_by_uid,blood_group,city FROM clinic_patients WHERE id=$1', [patientId])).rows[0], { email: 'private@example.test', legacy_created_by_uid: 'private-actor', blood_group: 'AB+', city: 'Synthetic city' });
    assert.equal((await sql.query('SELECT health_notes FROM clinic_patient_reported_profiles WHERE patient_id=$1', [patientId])).rows[0].health_notes, 'Private synthetic health');
    assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_patient_links WHERE patient_id=$1 AND user_id=$2', [patientId, linked])).rows[0].n, 1);
    assert.equal((await sql.query("SELECT count(*)::int n FROM clinic_operation_receipts WHERE actor_uid=$1", [uid])).rows[0].n, 1);
    const commit = store.saveStaff;
    store.saveStaff = async data => { await sql.query('UPDATE clinic_patients SET updated_at=now() WHERE id=$1', [patientId]); return commit(data); };
    await assert.rejects(saveStaff({ city: 'Synthetic racing city' }, before), error => error.code === 'aborted');
    store.saveStaff = commit;
    assert.equal((await sql.query('SELECT city FROM clinic_patients WHERE id=$1', [patientId])).rows[0].city, 'Synthetic city');
    assert.equal((await sql.query("SELECT count(*)::int n FROM clinic_audit_logs WHERE actor_uid=$1 AND action='staff_patient_demographics_saved'", [uid])).rows[0].n, 1);
    const current = await readStaff();
    const outcomes = await Promise.allSettled([
      saveStaff({ city: 'Synthetic staff city' }, current),
      api.save(patientRequest({ patientId, requestId: randomUUID(), expectedUpdatedAt: current.profile.updatedAt, profile: { displayName: 'Synthetic concurrent edit', phone: '+919876543210' } })),
    ]);
    assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 1);
    assert.equal(outcomes.find(row => row.status === 'rejected').reason.code, 'aborted');
    assert.equal((await sql.query("SELECT count(*)::int n FROM clinic_operation_receipts WHERE actor_uid=$1", [uid])).rows[0].n, 2);
    assert.equal((await sql.query('SELECT blood_group FROM clinic_patients WHERE id=$1', [patientId])).rows[0].blood_group, 'AB+');
  } finally {
    await sql.query('DELETE FROM clinic_patient_links WHERE user_id=ANY($1::text[])', [[linked, 'sql-staff-registry-patient-73']]);
    await sql.query('DELETE FROM clinic_users WHERE id=ANY($1::text[])', [[linked, 'sql-staff-registry-patient-73']]);
    await sql.query("DELETE FROM clinic_operation_receipts WHERE actor_uid='sql-staff-registry-patient-73'");
    await sql.query("DELETE FROM clinic_audit_logs WHERE actor_uid='sql-staff-registry-patient-73'");
    await auth.deleteUser('sql-staff-registry-patient-73');
  }
}));

test('SQL staff saves reconcile lost acknowledgements once, reject reused request IDs and keep unknown outcomes uncertain', async () => staffRegistryFixture(74, async ({ store, saveStaff, readStaff, uid }) => {
  const current = await readStaff();
  const requestId = randomUUID();
  const commit = store.saveStaff;
  store.saveStaff = async data => { await commit(data); throw Error('Synthetic lost staff acknowledgement'); };
  assert.deepEqual(await saveStaff({ city: 'Synthetic lost city' }, current, requestId), { saved: true });
  assert.deepEqual(await saveStaff({ city: 'Synthetic lost city' }, current, requestId), { saved: true });
  await assert.rejects(saveStaff({ city: 'Synthetic different city' }, current, requestId), error => error.code === 'already-exists');
  assert.equal((await sql.query("SELECT count(*)::int n FROM clinic_audit_logs WHERE actor_uid=$1 AND action='staff_patient_demographics_saved'", [uid])).rows[0].n, 1);
  store.saveStaff = async () => { throw Error('Synthetic unknown staff outcome'); };
  const before = await readStaff();
  await assert.rejects(saveStaff({ city: 'Synthetic unknown city' }, before), error => error.code === 'unavailable');
  assert.deepEqual(await readStaff(), before);
  assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_operation_receipts WHERE actor_uid=$1', [uid])).rows[0].n, 1);
  store.saveStaff = commit;
}));

test('SQL staff registry fails closed for token/claim mismatch, forced password, doctor claims and disabled accounts', async () => staffRegistryFixture(75, async ({ auth, uid, api, request, search, patientId, uhid }) => {
  await auth.setCustomUserClaims(uid, { role: 'manager' });
  assert.equal((await search({ uhid }, 'manager')).patients.length, 1);
  await assert.rejects(search({ uhid }, 'admin'), error => error.code === 'permission-denied');
  await assert.rejects(api.getStaff(request({ patientId })), error => error.code === 'permission-denied');
  await assert.rejects(api.saveStaff(request({ patientId, requestId: randomUUID(), expectedUpdatedAt: '2026-10-20T00:00:00.000000Z', profile: { displayName: 'Synthetic', phone: '+919876543210' } }, 'admin')), error => error.code === 'permission-denied');
  await auth.setCustomUserClaims(uid, { role: 'manager', forcePasswordChange: true });
  await assert.rejects(search({ uhid }, 'manager'), error => error.code === 'permission-denied');
  await assert.rejects(api.getStaff(request({ patientId }, 'manager')), error => error.code === 'permission-denied');
  await auth.setCustomUserClaims(uid, { role: 'doctor', doctorId: 'SYN-DOC-75' });
  await assert.rejects(search({ uhid }, 'doctor'), error => error.code === 'permission-denied');
  await assert.rejects(api.getStaff(request({ patientId }, 'doctor')), error => error.code === 'permission-denied');
  await auth.setCustomUserClaims(uid, { role: 'manager' });
  // The emulator never reports tokensValidAfterTime, so the live token-cutoff branch stays unit-covered only.
  await auth.updateUser(uid, { disabled: true });
  await assert.rejects(search({ uhid }, 'manager'), error => error.code === 'permission-denied');
  await assert.rejects(api.getStaff(request({ patientId }, 'manager')), error => error.code === 'permission-denied');
  await auth.updateUser(uid, { disabled: false });
  assert.equal((await search({ uhid }, 'manager')).patients.length, 1);
}));

test('staff registry IAM mutations deny anonymous and every browser role, including spoofed admin actors', async () => {
  const auditsBefore = (await sql.query("SELECT count(*)::int n FROM clinic_audit_logs WHERE action IN ('patient_registry_searched','patient_demographics_viewed','staff_patient_demographics_saved')")).rows[0].n;
  const patientId = randomUUID();
  const common = { actorUid: 'spoof', actorRole: 'admin' };
  const save = { ...common, patientId, requestId: randomUUID(), operation: 'spoof', expectedUpdatedAt: '2026-10-20T00:00:00Z', displayName: 'Synthetic', phone: '+919876543210', title: null, dateOfBirth: null, gender: null, maritalStatus: null, addressLine1: null, city: null, state: null, postalCode: null, emergencyContactName: null, emergencyContactPhone: null };
  for (const impersonate of [{ unauthenticated: true }, ...['patient', 'manager', 'doctor', 'admin'].map(role => ({ authClaims: { sub: `staff-registry-${role}`, role } }))]) {
    await assert.rejects(admin.executeMutation('SearchStaffPatientsByUhid', { ...common, uhid: 'SYN-999999' }, { impersonate }), accessDenied);
    await assert.rejects(admin.executeMutation('SearchStaffPatientsByPhone', { ...common, phone: '+919876543210' }, { impersonate }), accessDenied);
    await assert.rejects(admin.executeMutation('ReadStaffPatientDemographics', { ...common, patientId }, { impersonate }), accessDenied);
    await assert.rejects(admin.executeMutation('SaveStaffPatientDemographics', save, { impersonate }), accessDenied);
  }
  assert.equal((await sql.query("SELECT count(*)::int n FROM clinic_audit_logs WHERE action IN ('patient_registry_searched','patient_demographics_viewed','staff_patient_demographics_saved')")).rows[0].n, auditsBefore);
});

test('SQL staff registry late audit failure returns no data and leaves no receipts or partial evidence', async () => staffRegistryFixture(77, async ({ search, readStaff, saveStaff, patientId, uid }) => {
  const versionBefore = (await sql.query('SELECT updated_at FROM clinic_patients WHERE id=$1', [patientId])).rows[0].updated_at;
  // Exact synthetic actor and actions only; remove the local fault-injection constraint in finally.
  await sql.query(`ALTER TABLE clinic_audit_logs ADD CONSTRAINT synthetic_staff_audit_failure CHECK (NOT(actor_uid='${uid}' AND action IN ('patient_registry_searched','patient_demographics_viewed','staff_patient_demographics_saved')))`);
  try {
    await assert.rejects(search({ uhid: 'SYN-REG-77' }), error => error.code === 'unavailable');
    await assert.rejects(readStaff(), error => error.code === 'unavailable');
    await assert.rejects(saveStaff({ city: 'Synthetic late audit' }), error => error.code === 'unavailable');
    assert.deepEqual((await sql.query('SELECT updated_at FROM clinic_patients WHERE id=$1', [patientId])).rows[0].updated_at, versionBefore);
    assert.equal((await sql.query('SELECT city FROM clinic_patients WHERE id=$1', [patientId])).rows[0].city, null);
    assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_operation_receipts WHERE actor_uid=$1', [uid])).rows[0].n, 0);
    assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_audit_logs WHERE actor_uid=$1', [uid])).rows[0].n, 0);
  } finally {
    await sql.query('ROLLBACK');
    await sql.query('ALTER TABLE clinic_audit_logs DROP CONSTRAINT synthetic_staff_audit_failure');
  }
}));

async function linkAttemptFixture(suffix, run) {
  const { getAuth } = functionsRequire('firebase-admin/auth');
  const auth = getAuth(admin.app);
  const uid = `sql-link-attempts-${suffix}`;
  await auth.createUser({ uid, emailVerified: true });
  await sql.query('INSERT INTO clinic_users (id, display_name, active, created_at, updated_at) VALUES ($1, $2, true, now(), now())', [uid, 'Synthetic account']);
  const { sqlPatientLinkAttemptGuard } = require('../../functions/lib/sqlPatientLinkAttempts');
  try { await run({ auth, uid, attempt: sqlPatientLinkAttemptGuard(admin), guard: () => sqlPatientLinkAttemptGuard(admin) }); }
  finally {
    await sql.query('ROLLBACK');
    await sql.query('DELETE FROM clinic_audit_logs WHERE actor_uid=$1', [uid]);
    await sql.query('DELETE FROM clinic_users WHERE id=$1', [uid]);
    await auth.deleteUser(uid);
  }
}





test('staged patient backend debits the attempt before one-time code verification', async () => linkAttemptFixture(83, async ({ auth, uid }) => {
  const { getAuth } = functionsRequire('firebase-admin/auth');
  const staffAuth = getAuth(admin.app);
  const staffUid = 'sql-link-attempts-83-staff';
  const patientId = '80000000-0000-4000-8000-000000000083';
  await staffAuth.createUser({ uid: staffUid });
  await staffAuth.setCustomUserClaims(staffUid, { role: 'admin' });
  await sql.query('INSERT INTO clinic_patients(id,uhid,display_name,phone,created_at,updated_at) VALUES($1,$2,$3,$4,now(),now())', [patientId, 'SYN-ATT-83', 'Synthetic attempt patient', '+919876500000']);
  const { createPatientLinking, sqlPatientLinkStore } = require('../../functions/lib/patientLinking');
  const { createSqlPatientBackend } = require('../../functions/lib/sqlPatientBackend');
  const linking = createPatientLinking({ auth: staffAuth, store: sqlPatientLinkStore(admin) });
  const backend = createSqlPatientBackend({ auth, dc: admin });
  const staff = data => ({ auth: { uid: staffUid, token: { role: 'admin', auth_time: Math.floor(Date.now() / 1000) + 1 } }, data });
  const request = (data, patch = {}) => ({ auth: { uid, token: { email_verified: true, auth_time: Math.floor(Date.now() / 1000) + 1 } }, data, app: { appId: 'synthetic-app' }, ...patch });
  const debits = () => sql.query("SELECT count(*)::int n FROM clinic_audit_logs WHERE actor_uid=$1 AND action='patient_link_attempt'", [uid]);
  try {
    const { code } = await linking.issue(staff({ patientId, targetUid: uid, relationship: 'self', evidence: 'in_person_identity' }));
    await assert.rejects(backend.acceptSqlPatientLink(request({ code: 'Z'.repeat(43) })));
    assert.equal((await debits()).rows[0].n, 1);
    assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_patient_links WHERE patient_id=$1 AND user_id=$2', [patientId, uid])).rows[0].n, 0);
    assert.deepEqual(await backend.acceptSqlPatientLink(request({ code })), { linked: true });
    assert.equal((await debits()).rows[0].n, 2);
    assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_patient_links WHERE patient_id=$1 AND user_id=$2', [patientId, uid])).rows[0].n, 1);
    await assert.rejects(backend.acceptSqlPatientLink(request({ code }, { app: undefined })), error => error.code === 'failed-precondition');
    await assert.rejects(backend.acceptSqlPatientLink({ ...request({ code }), auth: { uid, token: { auth_time: 1 } } }), error => error.code === 'permission-denied');
    assert.equal((await debits()).rows[0].n, 2);
  } finally {
    await sql.query('DELETE FROM clinic_patient_link_invitations WHERE user_id=$1', [uid]);
    await sql.query('DELETE FROM clinic_patient_links WHERE user_id=$1', [uid]);
    await sql.query('DELETE FROM clinic_patients WHERE id=$1', [patientId]);
    await sql.query('DELETE FROM clinic_operation_receipts WHERE actor_uid=$1', [uid]);
    await sql.query("DELETE FROM clinic_audit_logs WHERE actor_uid=$1", [staffUid]);
    await sql.query('DELETE FROM clinic_users WHERE id=$1', [staffUid]);
    await staffAuth.deleteUser(staffUid);
  }
}));
