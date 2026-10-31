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
const accessDenied = (error) => /permission.denied|unauthenticated|not authorized|not allowed|NO_ACCESS/i.test(error.message);
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

test('booking settings persist exact-minute policy for runtime cancellation/availability with one audit and receipt', async () => bookingSettingsFixture('policy', async ({ api, read, settings, uid }) => {
  await settings({ cancelCutoffMinutes: 45, bookingWindowDays: 30, intervalMinutes: 15, leadMinutes: 60, bufferBeforeMinutes: 5, bufferAfterMinutes: 10, autoConfirm: true });
  const runtime = await api.runtime();
  assert.equal(runtime.patientCancellationCutoffHours, 0.75); assert.equal(runtime.cancelCutoffMinutes, 45);
  assert.equal(runtime.bookingWindowDays, 30); assert.equal(runtime.autoConfirm, true);
  assert.equal((await read()).settings.intervalMinutes, 15);
  assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_audit_logs WHERE actor_uid=$1', [uid])).rows[0].n, 1);
  assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_operation_receipts WHERE actor_uid=$1', [uid])).rows[0].n, 1);
}));

test('booking formats preserve legacy IDs/fees, create no doctor offerings, and never resurrect hidden consultation', async () => bookingSettingsFixture('formats', async ({ api, read, format, selectVisitType }) => {
  const offeringCount = (await sql.query('SELECT count(*)::int n FROM clinic_doctor_services')).rows[0].n;
  await sql.query("UPDATE clinic_services SET fee_paise=12345 WHERE code='consultation'");
  const initial = await read(); const consultation = initial.visitTypes[0];
  await format({ id: 'synthetic-video', label: 'Synthetic video consultation', minutes: 30, mode: 'video', active: true });
  await format({ ...consultation, minutes: 25, active: false });
  assert.equal((await sql.query("SELECT fee_paise FROM clinic_services WHERE code='consultation'")).rows[0].fee_paise, 12345);
  const runtime = await api.runtime();
  assert.throws(() => selectVisitType(runtime, 'consultation'));
  assert.throws(() => selectVisitType(runtime));
  assert.equal(selectVisitType(runtime, 'synthetic-video').minutes, 30);
  assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_doctor_services')).rows[0].n, offeringCount);
  await assert.rejects(format({ ...consultation, mode: 'video', active: true }), error => error.code === 'failed-precondition');
  await assert.rejects(format({ ...runtime.visitTypes.find(row => row.id === 'synthetic-video'), active: false }), error => error.code === 'failed-precondition');
}));

test('booking settings and format edits share one optimistic revision and concurrent hide cannot remove all active formats', async () => bookingSettingsFixture('race', async ({ read, settings, format }) => {
  await format({ id: 'synthetic-video', label: 'Synthetic video', minutes: 30, mode: 'video', active: true });
  let current = await read();
  const outcomes = await Promise.allSettled([settings({ leadMinutes: 50 }, current), format({ ...current.visitTypes[0], minutes: 35 }, current)]);
  assert.equal(outcomes.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(row => row.status === 'rejected').reason.code, 'aborted');
  current = await read();
  const hidden = await Promise.allSettled(current.visitTypes.map(row => format({ ...row, active: false }, current)));
  assert.equal(hidden.filter(row => row.status === 'fulfilled').length, 1);
  assert.ok((await read()).visitTypes.some(row => row.active));
}));

test('booking service late failure rolls back singleton revision and leaves service/audit/receipt unchanged', async () => bookingSettingsFixture('rollback', async ({ store, read, format, uid }) => {
  const before = await read(); const save = store.saveService;
  store.saveService = data => save({ ...data, id: randomUUID() });
  await assert.rejects(format({ ...before.visitTypes[0], label: 'Synthetic Must Roll Back' }, before));
  assert.deepEqual(await read(), before);
  assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_audit_logs WHERE actor_uid=$1', [uid])).rows[0].n, 0);
  assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_operation_receipts WHERE actor_uid=$1', [uid])).rows[0].n, 0);
}));

test('booking policy lost acknowledgement replays once and live demotion rejects even a committed retry', async () => bookingSettingsFixture('retry', async ({ auth, store, settings, read, uid }) => {
  const before = await read(); const requestId = randomUUID(); const save = store.saveSettings;
  store.saveSettings = async data => { await save(data); throw Error('Synthetic lost response'); };
  assert.equal((await settings({ leadMinutes: 60 }, before, requestId)).saved, true);
  assert.equal((await settings({ leadMinutes: 60 }, before, requestId)).saved, true);
  await assert.rejects(settings({ leadMinutes: 70 }, before, requestId), error => error.code === 'already-exists');
  assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_audit_logs WHERE actor_uid=$1', [uid])).rows[0].n, 1);
  await auth.setCustomUserClaims(uid, { role: 'manager' });
  await assert.rejects(settings({ leadMinutes: 60 }, before, requestId), error => error.code === 'permission-denied');
}));

test('booking settings IAM operations reject every browser role and anonymous caller', async () => {
  const common = { actorUid: 'spoof', requestId: randomUUID(), operation: 'spoof', expectedUpdatedAt: '2026-10-20T00:00:00Z' };
  const settings = { ...common, bookingWindowDays: 14, leadMinutes: 30, intervalMinutes: 20, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, cancelCutoffMinutes: 120, autoConfirm: false };
  const service = { ...common, id: randomUUID(), legacyId: 'synthetic-video', name: 'Synthetic Video', durationMinutes: 30, consultationMode: 'video', active: true };
  for (const impersonate of [{ unauthenticated: true }, ...['patient', 'manager', 'doctor', 'admin'].map(role => ({ authClaims: { sub: `settings-${role}`, role } }))]) {
    await assert.rejects(admin.executeQuery('ReadBookingSettings', undefined, { impersonate }), accessDenied);
    await assert.rejects(admin.executeQuery('GetBookingSettingsReceipt', { actorUid: common.actorUid, requestId: common.requestId }, { impersonate }), accessDenied);
    await assert.rejects(admin.executeMutation('SaveBookingSettings', settings, { impersonate }), accessDenied);
    await assert.rejects(admin.executeMutation('CreateBookingService', { ...service, sortOrder: 1 }, { impersonate }), accessDenied);
    await assert.rejects(admin.executeMutation('UpdateBookingService', { ...service, expectedServiceUpdatedAt: common.expectedUpdatedAt }, { impersonate }), accessDenied);
  }
});

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

test('SQL catalogue creates/edits all master types, preserves legacy booking IDs, and hides disabled parents', async () => catalogueFixture('crud', async ({ service, request, edit, branchAlias, departmentAlias, doctorAlias, uid }) => {
  const catalogue = await service.get(request({}));
  const branch = catalogue.branches.find(row => row.id === branchAlias);
  const department = catalogue.departments.find(row => row.id === departmentAlias);
  const doctor = catalogue.doctors.find(row => row.id === doctorAlias);
  assert.deepEqual(doctor.departmentIds, [departmentAlias]); assert.equal(doctor.branchId, branchAlias);
  await service.validateSelection({ branchId: branchAlias, departmentId: departmentAlias, doctorId: doctorAlias });
  assert.equal((await service.availableDoctor(doctorAlias)).id, doctorAlias);
  await edit('department', department, { description: 'Synthetic update' });
  await edit('doctor', doctor, { qualification: 'Synthetic qualification' });
  await edit('branch', branch, { active: false });
  const publicRows = await service.public();
  assert.ok(!publicRows.branches.some(row => row.id === branchAlias));
  assert.ok(!publicRows.departments.some(row => row.id === departmentAlias));
  assert.ok(!publicRows.doctors.some(row => row.id === doctorAlias));
  await assert.rejects(service.availableDoctor(doctorAlias), error => error.code === 'not-found');
  await assert.rejects(service.validateSelection({ branchId: branchAlias, departmentId: departmentAlias, doctorId: doctorAlias }), error => error.code === 'failed-precondition');
  assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_audit_logs WHERE actor_uid=$1', [uid])).rows[0].n, 6);
}));

test('SQL catalogue concurrent updates commit one winner per master and unchanged retries never duplicate audits', async () => catalogueFixture('race', async ({ service, request, edit, branchAlias, departmentAlias, doctorAlias, uid }) => {
  const catalogue = await service.get(request({}));
  for (const [action, group, alias] of [['branch', 'branches', branchAlias], ['department', 'departments', departmentAlias], ['doctor', 'doctors', doctorAlias]]) {
    const current = catalogue[group].find(row => row.id === alias);
    const requestId = randomUUID(); const results = await Promise.allSettled([edit(action, current, { name: 'Synthetic Winner A' }, requestId), edit(action, current, { name: 'Synthetic Winner B' })]);
    assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
    assert.equal(results.find(row => row.status === 'rejected').reason.code, 'aborted');
    if (results[0].status === 'fulfilled') assert.equal((await edit(action, current, { name: 'Synthetic Winner A' }, requestId)).saved, true);
  }
  assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_audit_logs WHERE actor_uid=$1', [uid])).rows[0].n, 6);
}));

test('SQL catalogue doctor membership failure rolls back the profile and original joins without audit/receipt', async () => catalogueFixture('rollback', async ({ store, service, request, edit, doctorAlias, doctorId, uid }) => {
  const row = (await service.get(request({}))).doctors.find(row => row.id === doctorAlias);
  const before = (await sql.query('SELECT * FROM clinic_doctor_departments WHERE doctor_id=$1', [doctorId])).rows;
  const write = store.save;
  // Inject a late server adapter fault: the second membership evaluates beyond the validated list.
  store.save = data => write({ ...data, member1: true });
  await assert.rejects(edit('doctor', row, { name: 'Synthetic Should Roll Back' }), error => error.code === 'unavailable');
  assert.equal((await sql.query('SELECT name FROM clinic_doctors WHERE id=$1', [doctorId])).rows[0].name, row.name);
  assert.deepEqual((await sql.query('SELECT * FROM clinic_doctor_departments WHERE doctor_id=$1', [doctorId])).rows, before);
  assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_operation_receipts WHERE actor_uid=$1', [uid])).rows[0].n, 3);
}));

test('SQL catalogue lost commit acknowledgement replays and demoted callers lose access immediately', async () => catalogueFixture('replay', async ({ auth, store, service, request, edit, branchAlias, uid }) => {
  const branch = (await service.get(request({}))).branches.find(row => row.id === branchAlias);
  const write = store.save; const requestId = randomUUID();
  store.save = async data => { await write(data); throw Error('Synthetic lost response'); };
  assert.equal((await edit('branch', branch, { name: 'Synthetic Saved Once' }, requestId)).saved, true);
  assert.equal((await edit('branch', branch, { name: 'Synthetic Saved Once' }, requestId)).saved, true);
  assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_audit_logs WHERE actor_uid=$1', [uid])).rows[0].n, 4);
  await auth.setCustomUserClaims(uid, { role: 'manager' });
  await assert.rejects(service.get(request({})), error => error.code === 'permission-denied');
  await assert.rejects(edit('branch', branch, { name: 'Synthetic Saved Once' }, requestId), error => error.code === 'permission-denied');
}));

test('SQL catalogue preserves ordered twelve-department membership and removes deselected joins atomically', async () => catalogueFixture('members', async ({ service, request, edit, branchId, doctorId, doctorAlias, departmentAlias }) => {
  const extras = Array.from({ length: 11 }, (_, i) => ({ id: randomUUID(), alias: `synthetic-member-${i}` }));
  try {
    for (const [i, row] of extras.entries()) await sql.query('INSERT INTO clinic_departments(id,legacy_id,branch_id,code,name,active,public_booking_enabled,sort_order,updated_at) VALUES($1,$2,$3,$4,$5,true,true,$6,now())', [row.id, row.alias, branchId, `SYN-MEMBER-${i}`, 'Synthetic Department', i]);
    const doctor = (await service.get(request({}))).doctors.find(row => row.id === doctorAlias);
    const aliases = [departmentAlias, ...extras.map(row => row.alias).reverse()];
    await edit('doctor', doctor, { departmentIds: aliases });
    const updated = (await service.get(request({}))).doctors.find(row => row.id === doctorAlias);
    assert.deepEqual(updated.departmentIds, aliases);
    assert.deepEqual((await sql.query('SELECT sort_order FROM clinic_doctor_departments WHERE doctor_id=$1 ORDER BY sort_order', [doctorId])).rows.map(row => row.sort_order), Array.from({ length: 12 }, (_, i) => i));
    await edit('doctor', updated, { departmentIds: [departmentAlias] });
    assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_doctor_departments WHERE doctor_id=$1', [doctorId])).rows[0].n, 1);
  } finally {
    await sql.query('ROLLBACK');
    await sql.query('DELETE FROM clinic_doctor_departments WHERE doctor_id=$1', [doctorId]);
    for (const row of extras) await sql.query('DELETE FROM clinic_departments WHERE id=$1', [row.id]);
  }
}));

test('SQL catalogue private reads/receipts and all master mutations deny anonymous and every browser role', async () => {
  const vars = { actorUid: 'spoof', requestId: randomUUID(), operation: 'spoof', id: randomUUID(), legacyId: 'spoof', name: 'Spoof', active: true, code: 'SPOOF', address: 'Spoof', branchId: '00000000-0000-4000-8000-000000000001', registrationNumber: 'SPOOF', qualification: '', bookingEnabled: true, publicBookingEnabled: true, description: '', sortOrder: 0, departmentIds: [], expectedUpdatedAt: '2026-10-20T00:00:00Z', ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`member${i}`, false])) };
  for (const impersonate of [{ unauthenticated: true }, ...['patient', 'manager', 'doctor', 'admin'].map(role => ({ authClaims: { sub: `catalogue-${role}`, role } }))]) {
    await assert.rejects(admin.executeQuery('ReadSqlCatalogue', undefined, { impersonate }), accessDenied);
    await assert.rejects(admin.executeQuery('GetCatalogueReceipt', { actorUid: vars.actorUid, requestId: vars.requestId }, { impersonate }), accessDenied);
    for (const kind of ['Branch', 'Department', 'Doctor']) for (const mode of ['Create', 'Update']) {
      const keys = ['actorUid', 'requestId', 'operation', 'id', 'legacyId', 'name', 'active', ...(mode === 'Update' ? ['expectedUpdatedAt'] : []), ...(kind === 'Branch' ? ['code', 'address'] : kind === 'Department' ? ['branchId', 'code', 'description', 'sortOrder', 'publicBookingEnabled'] : ['branchId', 'qualification', 'registrationNumber', 'bookingEnabled', 'departmentIds', ...Array.from({ length: 12 }, (_, i) => `member${i}`)])];
      await assert.rejects(admin.executeMutation(`${mode}Catalogue${kind}`, Object.fromEntries(keys.map(key => [key, vars[key]])), { impersonate }), accessDenied);
    }
  }
});

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

test('clinic contact editor saves through live Auth and SQL, publishes public projection, and replays without duplicate audit', async () => contactFixture('save', async ({ service, request, input, uid, auth }) => {
  assert.equal((await service.save(request(input))).saved, true);
  assert.equal((await service.save(request(input))).saved, true);
  const publicContact = (await clinic.executeQuery('GetPublicClinicContact', undefined, { impersonate: { unauthenticated: true } })).data.clinicProfile;
  assert.deepEqual(publicContact, { ...input.profile, timezone: 'Asia/Kolkata' });
  assert.equal((await sql.query("SELECT count(*)::int n FROM clinic_audit_logs WHERE actor_uid=$1 AND action='clinic_contact_saved'", [uid])).rows[0].n, 1);
  const event = (await sql.query('SELECT actor_role,resource_type,resource_id FROM clinic_audit_logs WHERE actor_uid=$1', [uid])).rows[0];
  assert.deepEqual(event, { actor_role: 'admin', resource_type: 'clinic_profile', resource_id: 'sood-clinic' });
  await assert.rejects(service.save(request({ ...input, profile: { ...input.profile, name: 'Different payload' } })), error => error.code === 'already-exists');
  await auth.setCustomUserClaims(uid, { role: 'manager' });
  await assert.rejects(service.save(request(input)), error => error.code === 'permission-denied');
}));

test('clinic contact competing versions allow one winner and stale requests cannot leave receipts or audits', async () => contactFixture('race', async ({ service, request, input, uid }) => {
  const second = { ...input, requestId: randomUUID(), profile: { ...input.profile, name: 'Synthetic competing clinic' } };
  const outcomes = await Promise.allSettled([service.save(request(input)), service.save(request(second))]);
  assert.equal(outcomes.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(outcomes.find(item => item.status === 'rejected').reason.code, 'aborted');
  assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_audit_logs WHERE actor_uid=$1', [uid])).rows[0].n, 1);
  assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_operation_receipts WHERE actor_uid=$1', [uid])).rows[0].n, 1);
  await assert.rejects(service.save(request({ ...input, requestId: randomUUID() })), error => error.code === 'aborted');
}));

test('clinic contact lost commit response is reconciled with the scoped receipt, not a second write', async () => contactFixture('lost', async ({ store, service, request, input, uid }) => {
  const save = store.save;
  store.save = async data => { await save(data); throw Error('Synthetic transport failure after commit'); };
  assert.equal((await service.save(request(input))).saved, true);
  assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_operation_receipts WHERE actor_uid=$1', [uid])).rows[0].n, 1);
  assert.equal((await sql.query('SELECT count(*)::int n FROM clinic_audit_logs WHERE actor_uid=$1', [uid])).rows[0].n, 1);
}));

test('clinic contact SQL operations remain inaccessible to all browser roles, including admin claims', async () => {
  const variables = { requestId: randomUUID(), actorUid: 'spoofed-admin', operation: 'spoof', expectedUpdatedAt: '2026-10-20T00:00:00Z', name: 'Spoofed clinic', phone: '+918988207797', email: 'spoof@example.test', address: 'Spoof', timezone: 'Asia/Kolkata' };
  for (const impersonate of [{ unauthenticated: true }, ...['patient', 'manager', 'doctor', 'admin'].map(role => ({ authClaims: { sub: `contact-${role}`, role } }))]) {
    await assert.rejects(admin.executeQuery('GetAdminClinicContact', undefined, { impersonate }), accessDenied);
    await assert.rejects(admin.executeQuery('GetClinicContactReceipt', { actorUid: variables.actorUid, requestId: variables.requestId }, { impersonate }), accessDenied);
    await assert.rejects(admin.executeMutation('SaveClinicContact', variables, { impersonate }), accessDenied);
  }
});

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

test('repeatable fixtures produce one linked catalog and integer-paise service', async () => {
  await seed();
  const counts = await sql.query('SELECT (SELECT count(*) FROM clinic_branches)::int AS branches, (SELECT count(*) FROM clinic_doctor_departments)::int AS memberships');
  assert.deepEqual(counts.rows[0], { branches: 1, memberships: 1 });
  const result = await clinic.executeQuery('GetPublicClinic', undefined, { impersonate: { unauthenticated: true } });
  assert.equal(result.data.clinicProfile.timezone, 'Asia/Kolkata');
  assert.equal(result.data.doctors.length, 1);
  assert.equal(result.data.services[0].durationMinutes, 20);
  assert.deepEqual(Object.keys(result.data).sort(), ['branches', 'clinicProfile', 'departments', 'doctors', 'services']);
});

test('database rejects dangling foreign keys and duplicate identifiers', async () => {
  await assert.rejects(sql.query('INSERT INTO clinic_doctor_departments (doctor_id, department_id) VALUES ($1, $2)', ['00000000-0000-4000-8000-000000000099', '00000000-0000-4000-8000-000000000002']), { code: '23503' });
  await assert.rejects(sql.query("INSERT INTO clinic_branches (id, code, name, address, timezone, active, created_at, updated_at) SELECT '00000000-0000-4000-8000-000000000098', code, name, address, timezone, active, created_at, updated_at FROM clinic_branches LIMIT 1"), { code: '23505' });
});

test('database rollback leaves no partial write after a failing relation', async () => {
  await sql.query('BEGIN');
  try {
    await sql.query("UPDATE clinic_branches SET name = 'Should roll back' WHERE code = 'SOOD'");
    await assert.rejects(sql.query('INSERT INTO clinic_doctor_departments (doctor_id, department_id) VALUES ($1, $2)', ['00000000-0000-4000-8000-000000000099', '00000000-0000-4000-8000-000000000002']), { code: '23503' });
  } finally {
    await sql.query('ROLLBACK');
  }
  assert.equal((await sql.query("SELECT name FROM clinic_branches WHERE code = 'SOOD'")).rows[0].name, 'Sood Clinic');
});

test('self-profile query rejects anonymous callers and binds reads to authenticated UID', async () => {
  await sql.query("INSERT INTO clinic_users (id, display_name, active, created_at, updated_at) VALUES ('sql-test-alice', 'Test Alice', true, now(), now()), ('sql-test-bob', 'Test Bob', true, now(), now())");
  await assert.rejects(clinic.executeQuery('GetOwnSqlProfile', undefined, { impersonate: { unauthenticated: true } }), accessDenied);
  const result = await clinic.executeQuery('GetOwnSqlProfile', undefined, { impersonate: { authClaims: { sub: 'sql-test-alice' } } });
  assert.equal(result.data.user.id, 'sql-test-alice');
  assert.equal(result.data.user.displayName, 'Test Alice');
  const missing = await clinic.executeQuery('GetOwnSqlProfile', undefined, { impersonate: { authClaims: { sub: 'sql-test-nobody' } } });
  assert.equal(missing.data.user, null);
});

test('IAM-only query and seed deny anonymous, patient and admin-claim callers', async () => {
  for (const impersonate of [{ unauthenticated: true }, { authClaims: { sub: 'sql-test-alice' } }, { authClaims: { sub: 'sql-test-admin', role: 'admin' } }]) {
    await assert.rejects(admin.executeQuery('CheckSqlFoundation', undefined, { impersonate }), accessDenied);
    await assert.rejects(admin.executeMutation('SeedFoundation', undefined, { impersonate }), accessDenied);
    await assert.rejects(admin.executeMutation('ImportPublicClinicContact', { name: 'Clinic', phone: '+918988207797', email: 'clinic@example.com', address: 'Test address', timezone: 'Asia/Kolkata' }, { impersonate }), accessDenied);
  }
});

test('private clinical and patient collections have no exposed connector operation', async () => {
  await assert.rejects(clinic.executeQuery('ListPatients', undefined, { impersonate: { authClaims: { sub: 'sql-test-manager', role: 'manager' } } }), /not found/i);
  const result = await sql.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'clinic_%'");
  // First release: exactly the 22 deployed tables. Deferred models are not migrated.
  assert.equal(result.rows.length, 22);
});










test('verified account save binds UID, records audit and rejects retries', async () => {
  const uid = 'sql-phase2-owner';
  const variables = { displayName: 'Test Account', requestId: '10000000-0000-4000-8000-000000000001' };
  const options = { impersonate: { authClaims: { sub: uid, email_verified: true } } };
  await clinic.executeMutation('SaveOwnSqlProfile', variables, options);
  const profile = await clinic.executeQuery('GetOwnSqlProfile', undefined, options);
  assert.equal(profile.data.user.id, uid);
  assert.equal(profile.data.user.displayName, 'Test Account');
  await assert.rejects(clinic.executeMutation('SaveOwnSqlProfile', variables, options), /REQUEST_ALREADY_APPLIED/);
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_audit_logs WHERE resource_id = $1', [uid])).rows[0].count, 1);
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_staff_profiles WHERE user_id = $1', [uid])).rows[0].count, 0);
});

test('account save rejects anonymous, unverified, inactive and invalid input', async () => {
  const variables = { displayName: 'Test Account', requestId: '10000000-0000-4000-8000-000000000002' };
  for (const impersonate of [{ unauthenticated: true }, { authClaims: { sub: 'sql-phase2-unverified', email_verified: false } }]) {
    await assert.rejects(clinic.executeMutation('SaveOwnSqlProfile', variables, { impersonate }), accessDenied);
  }
  const options = { impersonate: { authClaims: { sub: 'sql-phase2-validation', email_verified: true } } };
  for (const displayName of ['', ' ', ' leading', 'trailing ', 'a'.repeat(161), 'line\nbreak']) {
    await assert.rejects(clinic.executeMutation('SaveOwnSqlProfile', { ...variables, displayName }, options), accessDenied);
    await sql.query('ROLLBACK');
  }
  await sql.query("INSERT INTO clinic_users (id, display_name, active, created_at, updated_at) VALUES ('sql-phase2-inactive', 'Inactive', false, now(), now())");
  await assert.rejects(clinic.executeMutation('SaveOwnSqlProfile', variables, { impersonate: { authClaims: { sub: 'sql-phase2-inactive', email_verified: true } } }), /ACCOUNT_INACTIVE/);
  assert.equal((await sql.query("SELECT active FROM clinic_users WHERE id = 'sql-phase2-inactive'")).rows[0].active, false);
  await assert.rejects(clinic.executeMutation('SaveOwnSqlProfile', variables, { impersonate: { authClaims: { sub: 'sql-phase2-forced', email_verified: true, forcePasswordChange: true } } }), accessDenied);
  await assert.rejects(clinic.executeMutation('SaveOwnSqlProfile', { ...variables, uid: 'sql-test-bob', role: 'admin' }, options), /not expected|unexpected/i);
});

test('concurrent retry commits one profile receipt and audit only', async () => {
  const uid = 'sql-phase2-concurrent';
  const variables = { displayName: 'Concurrent Account', requestId: '10000000-0000-4000-8000-000000000003' };
  const options = { impersonate: { authClaims: { sub: uid, email_verified: true } } };
  const results = await Promise.allSettled([clinic.executeMutation('SaveOwnSqlProfile', variables, options), clinic.executeMutation('SaveOwnSqlProfile', variables, options)]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_audit_logs WHERE resource_id = $1', [uid])).rows[0].count, 1);
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_operation_receipts WHERE actor_uid = $1', [uid])).rows[0].count, 1);
});

test('generated browser SDK reads the public contact through the emulator', async () => {
  const { initializeApp, deleteApp } = require('firebase/app');
  const { getDataConnect, connectDataConnectEmulator } = require('firebase/data-connect');
  const { getPublicClinicContact, connectorConfig } = require('../generated/clinic');
  const app = initializeApp({ projectId: 'demo-sood-clinic', apiKey: 'local-test-only', appId: 'local-test' }, 'sql-browser-test');
  try {
    const dc = getDataConnect(app, connectorConfig);
    connectDataConnectEmulator(dc, '127.0.0.1', 9399);
    assert.equal((await getPublicClinicContact(dc)).data.clinicProfile.name, 'Sood Clinic');
  } finally { await deleteApp(app); }
});

test('staff SQL reconciliation is bounded, idempotent and inaccessible to browser claims', async () => {
  const { createStaffDirectory, sqlStaffStore } = require('../../functions/lib/sqlStaffDirectory');
  const actor = { uid: 'sql-directory-admin', displayName: 'Synthetic admin', email: 'admin@example.test', customClaims: { role: 'admin' }, disabled: false };
  const manager = { uid: 'sql-directory-manager', displayName: 'Synthetic manager', email: 'manager@example.test', customClaims: { role: 'manager' }, disabled: false };
  const patient = { uid: 'sql-directory-patient', customClaims: {}, disabled: false };
  let users = [actor, manager, patient];
  const handler = createStaffDirectory({
    auth: { getUser: async () => actor, listUsers: async () => ({ users }) },
    store: sqlStaffStore(admin),
  });
  const request = { auth: { uid: actor.uid, token: { role: 'admin', auth_time: 1 } }, data: { limit: 1 } };
  const first = await handler(request);
  assert.equal(first.updated, 2);
  assert.equal(first.total, 2);
  assert.equal(first.staff.length, 1);
  assert.equal(first.nextCursor, actor.uid);
  const second = await handler({ ...request, data: { limit: 1, cursor: first.nextCursor } });
  assert.equal(second.updated, 0);
  assert.equal(second.staff[0].uid, manager.uid);
  assert.equal(second.nextCursor, null);
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_users WHERE id=$1', [patient.uid])).rows[0].count, 0);
  users = [actor, patient];
  assert.equal((await handler(request)).updated, 1);
  assert.equal((await handler(request)).total, 1);
  const removed = (await sql.query('SELECT role, active FROM clinic_staff_profiles WHERE user_id=$1', [manager.uid])).rows[0];
  assert.deepEqual(removed, { role: 'none', active: false });
  assert.equal((await sql.query("SELECT count(*)::int AS count FROM clinic_audit_logs WHERE action='staff_identity_reconciled'")).rows[0].count, 3);
  for (const impersonate of [{ unauthenticated: true }, { authClaims: { sub: actor.uid, role: 'admin' } }]) {
    await assert.rejects(admin.executeQuery('ListStaffIdentityPage', { afterUid: '', limit: 10 }, { impersonate }), accessDenied);
    await assert.rejects(admin.executeMutation('UpsertStaffIdentity', { uid: actor.uid, name: 'Denied', email: '', role: 'admin', doctorLegacyId: null, accountActive: true, active: true, requiresPasswordChange: false, sessionValidAfterSeconds: '0', actorUid: actor.uid }, { impersonate }), accessDenied);
  }
});

test('SQL staff lock serializes changes and rolls back an incorrect owner', async () => {
  const actorUid = 'sql-directory-admin';
  const first = { actorUid, actorRole: 'admin', targetUid: actorUid, action: 'staff_change_started', requestId: '30000000-0000-4000-8000-000000000001' };
  const next = { ...first, requestId: '30000000-0000-4000-8000-000000000002' };
  await admin.executeMutation('BeginStaffAccessChange', first);
  const pending = (await admin.executeQuery('InspectStaffAccessChange', { requestId: first.requestId })).data.auditLog;
  assert.equal(pending.resourceId, actorUid);
  assert.equal(pending.action, first.action);
  await assert.rejects(admin.executeMutation('BeginStaffAccessChange', next));
  await sql.query('ROLLBACK');
  const { action, ...owner } = first;
  assert.equal(action, 'staff_change_started');
  await assert.rejects(admin.executeMutation('AbortStaffAccessChange', { ...owner, requestId: next.requestId }), /STAFF_LOCK_NOT_OWNED/);
  await sql.query('ROLLBACK');
  await admin.executeMutation('AbortStaffAccessChange', owner);
  assert.equal((await admin.executeQuery('InspectStaffAccessLock')).data.staffAccessLock, null);
  for (const impersonate of [{ unauthenticated: true }, { authClaims: { sub: actorUid, role: 'admin' } }]) {
    await assert.rejects(admin.executeMutation('BeginStaffAccessChange', next, { impersonate }), accessDenied);
    await assert.rejects(admin.executeQuery('ListStaffAudit', { limit: 10 }, { impersonate }), accessDenied);
  }
});

test('real Auth password replacement commits SQL staff state and audit without Firestore', async () => {
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099');
  const { getAuth } = functionsRequire('firebase-admin/auth');
  const { createStaffLifecycle, sqlStaffLifecycleStore } = require('../../functions/lib/staffLifecycle');
  const auth = getAuth(admin.app);
  const uid = 'sql-password-replacement';
  await auth.createUser({ uid, email: 'password-fixture@example.test', password: 'Temporary9%' });
  await auth.setCustomUserClaims(uid, { role: 'manager', forcePasswordChange: true });
  const signIn = async (password) => {
    const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-only', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'password-fixture@example.test', password, returnSecureToken: true }),
    });
    return { ok: response.ok, data: await response.json() };
  };
  const login = await signIn('Temporary9%');
  assert.equal(login.ok, true);
  const token = await auth.verifyIdToken(login.data.idToken);
  const lifecycle = createStaffLifecycle({ auth, store: sqlStaffLifecycleStore(admin) });
  await lifecycle.completePassword({ auth: { uid, token }, data: { newPassword: 'Replacement9%' } });
  assert.equal((await signIn('Temporary9%')).ok, false);
  const replacement = await signIn('Replacement9%');
  assert.equal(replacement.ok, true);
  assert.equal((await auth.verifyIdToken(replacement.data.idToken)).forcePasswordChange, false);
  assert.equal((await auth.getUser(uid)).customClaims.forcePasswordChange, false);
  const row = (await sql.query('SELECT requires_password_change FROM clinic_staff_profiles WHERE user_id=$1', [uid])).rows[0];
  assert.equal(row.requires_password_change, false);
  assert.equal((await sql.query("SELECT count(*)::int AS count FROM clinic_audit_logs WHERE resource_id=$1 AND action='staff_password_changed'", [uid])).rows[0].count, 1);
  assert.equal((await admin.executeQuery('InspectStaffAccessLock')).data.staffAccessLock, null);
});

test('real Auth staff provisioning, doctor assignment and suspension persist only to SQL', async () => {
  const { getAuth } = functionsRequire('firebase-admin/auth');
  const { createStaffLifecycle, sqlStaffLifecycleStore } = require('../../functions/lib/staffLifecycle');
  const auth = getAuth(admin.app);
  const actorUid = 'sql-lifecycle-administrator';
  await auth.createUser({ uid: actorUid, email: 'lifecycle-admin@example.test', password: 'AdminTest9%' });
  await auth.setCustomUserClaims(actorUid, { role: 'admin' });
  const lifecycle = createStaffLifecycle({ auth, store: sqlStaffLifecycleStore(admin) });
  const call = (data) => lifecycle.manage({ auth: { uid: actorUid, token: { role: 'admin', auth_time: Math.floor(Date.now() / 1000) } }, data });
  const email = 'managed-lifecycle@example.test';
  const created = await call({ action: 'provision', email, displayName: 'Fixture Manager', role: 'manager', password: 'ManagerTest9%' });
  const user = await auth.getUser(created.uid);
  assert.equal(user.disabled, false);
  assert.equal(user.customClaims.forcePasswordChange, true);
  assert.equal(user.customClaims.role, 'manager');
  await assert.rejects(call({ action: 'provision', email, displayName: 'Fixture Manager', role: 'manager', password: 'OtherPassword9%' }), (error) => error.code === 'already-exists');
  await call({ action: 'updateAccess', email, displayName: 'Fixture Doctor', role: 'doctor', doctorId: 'brig-ak-sood' });
  assert.equal((await auth.getUser(created.uid)).customClaims.doctorId, 'brig-ak-sood');
  await call({ action: 'disable', email, disabled: true });
  assert.equal((await auth.getUser(created.uid)).disabled, true);
  const row = (await sql.query('SELECT role, doctor_legacy_id, active FROM clinic_staff_profiles WHERE user_id=$1', [created.uid])).rows[0];
  assert.deepEqual(row, { role: 'doctor', doctor_legacy_id: 'brig-ak-sood', active: false });
  await assert.rejects(call({ action: 'disable', email: 'lifecycle-admin@example.test', disabled: true }), (error) => error.code === 'failed-precondition');
  assert.equal((await admin.executeQuery('InspectStaffAccessLock')).data.staffAccessLock, null);
  const events = (await admin.executeQuery('ListStaffAudit', { limit: 50 })).data.auditLogs;
  assert.ok(events.some((row) => row.resourceId === created.uid && row.action === 'staff_suspended'));
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

test('verified clinic code links account to a separate patient and is consumed with its audit atomically', async () => {
  const fixture = await linkingFixture(1);
  const { code } = await fixture.issue();
  const row = (await sql.query('SELECT token_hash FROM clinic_patient_link_invitations WHERE user_id=$1', [fixture.uid])).rows[0];
  assert.equal(row.token_hash.length, 64);
  assert.notEqual(row.token_hash, code);
  assert.deepEqual(await fixture.accept(code), { linked: true });
  assert.deepEqual((await sql.query("SELECT resource_id FROM clinic_audit_logs WHERE actor_uid=$1 AND action='patient_link_accepted'", [fixture.uid])).rows, [{ resource_id: `${fixture.patientId}/${fixture.uid}` }]);
  const link = (await sql.query('SELECT patient_id, user_id, relationship, verified_by FROM clinic_patient_links WHERE user_id=$1', [fixture.uid])).rows[0];
  assert.deepEqual(link, { patient_id: fixture.patientId, user_id: fixture.uid, relationship: 'self', verified_by: 'sql-lifecycle-administrator' });
  await assert.rejects(fixture.accept(code));
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_patient_link_invitations WHERE user_id=$1', [fixture.uid])).rows[0].count, 0);
  assert.equal((await sql.query("SELECT count(*)::int AS count FROM clinic_audit_logs WHERE resource_id=$1 AND action='patient_link_accepted'", [`${fixture.patientId}/${fixture.uid}`])).rows[0].count, 1);
});

test('expired, replaced and cross-account linking codes cannot grant access', async () => {
  const fixture = await linkingFixture(2);
  const { code: oldCode } = await fixture.issue();
  const { code } = await fixture.issue();
  await assert.rejects(fixture.accept(oldCode));
  await assert.rejects(fixture.accept(code, 'sql-link-1'));
  await sql.query("UPDATE clinic_patient_link_invitations SET expires_at=now()-interval '1 minute' WHERE user_id=$1", [fixture.uid]);
  await assert.rejects(fixture.accept(code));
  await sql.query('ROLLBACK');
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_patient_links WHERE user_id=$1', [fixture.uid])).rows[0].count, 0);
});

test('concurrent code consumption grants one link and one acceptance audit', async () => {
  const fixture = await linkingFixture(3);
  const { code } = await fixture.issue();
  const results = await Promise.allSettled([fixture.accept(code), fixture.accept(code)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  await sql.query('ROLLBACK');
  assert.equal((await sql.query("SELECT count(*)::int AS count FROM clinic_audit_logs WHERE resource_id=$1 AND action='patient_link_accepted'", [`${fixture.patientId}/${fixture.uid}`])).rows[0].count, 1);
});

test('revocation cancels pending codes and accepted links without changing other family members', async () => {
  const fixture = await linkingFixture(4);
  const { code: cancelled } = await fixture.issue('guardian', 'guardian_authority');
  await fixture.revoke();
  await assert.rejects(fixture.accept(cancelled));
  const { code } = await fixture.issue('guardian', 'guardian_authority');
  await fixture.accept(code);
  await fixture.revoke();
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_patient_links WHERE user_id=$1', [fixture.uid])).rows[0].count, 0);
  assert.equal((await sql.query("SELECT count(*)::int AS count FROM clinic_patient_links WHERE user_id='sql-link-1'")).rows[0].count, 1);
});

test('inactive accounts and archived patients roll back code consumption without an acceptance audit', async () => {
  const fixture = await linkingFixture(5);
  const { code } = await fixture.issue();
  await sql.query('UPDATE clinic_users SET active=false WHERE id=$1', [fixture.uid]);
  await assert.rejects(fixture.accept(code));
  await sql.query('ROLLBACK');
  await sql.query('UPDATE clinic_users SET active=true WHERE id=$1', [fixture.uid]);
  await sql.query('UPDATE clinic_patients SET archived_at=now() WHERE id=$1', [fixture.patientId]);
  await assert.rejects(fixture.accept(code));
  await sql.query('ROLLBACK');
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_patient_link_invitations WHERE user_id=$1', [fixture.uid])).rows[0].count, 1);
  assert.equal((await sql.query("SELECT count(*)::int AS count FROM clinic_audit_logs WHERE resource_id=$1 AND action='patient_link_accepted'", [`${fixture.patientId}/${fixture.uid}`])).rows[0].count, 0);
});

test('patient-link IAM operations deny browser patients, managers and administrators', async () => {
  const issue = { patientId: '40000000-0000-4000-8000-000000000001', targetUid: 'sql-link-1', tokenHash: 'a'.repeat(64), relationship: 'self', evidence: 'in_person_identity', actorUid: 'sql-lifecycle-administrator', actorRole: 'admin', expiresAt: new Date(Date.now() + 600000).toISOString(), resourceId: '40000000-0000-4000-8000-000000000001/sql-link-1' };
  for (const impersonate of [{ unauthenticated: true }, { authClaims: { sub: 'sql-link-1', email_verified: true } }, { authClaims: { sub: 'manager', role: 'manager' } }, { authClaims: { sub: 'admin', role: 'admin' } }]) {
    await assert.rejects(admin.executeMutation('IssuePatientLinkInvitation', issue, { impersonate }), accessDenied);
    await assert.rejects(admin.executeQuery('FindPatientLinkInvitation', { tokenHash: issue.tokenHash, targetUid: issue.targetUid }, { impersonate }), accessDenied);
    await assert.rejects(admin.executeMutation('AcceptPatientLinkInvitation', { patientId: issue.patientId, targetUid: issue.targetUid, tokenHash: issue.tokenHash, relationship: 'self', verifiedBy: issue.actorUid, resourceId: issue.resourceId }, { impersonate }), accessDenied);
    await assert.rejects(admin.executeMutation('RevokePatientLink', { patientId: issue.patientId, targetUid: issue.targetUid, actorUid: issue.actorUid, actorRole: 'admin', resourceId: issue.resourceId }, { impersonate }), accessDenied);
  }
});

test('family links support multiple patients/accounts and concurrent revocation never leaves access behind', async () => {
  const first = await linkingFixture(6);
  const second = await linkingFixture(7);
  const { code: firstCode } = await first.issue();
  await first.accept(firstCode);
  const staffRequest = (patientId, targetUid, extra = {}) => ({ auth: { uid: 'sql-lifecycle-administrator', token: { role: 'admin', auth_time: Math.floor(Date.now() / 1000) } }, data: { patientId, targetUid, ...extra } });
  const { code } = await first.service.issue(staffRequest(second.patientId, first.uid, { relationship: 'guardian', evidence: 'guardian_authority' }));
  await first.accept(code);
  const { code: shared } = await second.issue();
  await second.accept(shared);
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_patient_links WHERE user_id=$1', [first.uid])).rows[0].count, 2);
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_patient_links WHERE patient_id=$1', [second.patientId])).rows[0].count, 2);
  await first.service.revoke(staffRequest(second.patientId, first.uid));
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_patient_links WHERE patient_id=$1', [second.patientId])).rows[0].count, 1);
  await second.revoke();
  const { code: racing } = await second.issue();
  const results = await Promise.allSettled([second.accept(racing), second.revoke()]);
  assert.equal(results[1].status, 'fulfilled');
  await sql.query('ROLLBACK');
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_patient_links WHERE user_id=$1', [second.uid])).rows[0].count, 0);
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_patient_link_invitations WHERE user_id=$1', [second.uid])).rows[0].count, 0);
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

test('SQL link attempts debit five per rolling ten-minute window and keep UID-only evidence', async () => linkAttemptFixture(80, async ({ uid, attempt }) => {
  for (let n = 0; n < 5; n++) assert.equal(await attempt({ actorUid: uid, appId: 'synthetic-app' }), true);
  await sql.query("UPDATE clinic_audit_logs SET occurred_at=now()-interval '11 minutes' WHERE actor_uid=$1 AND action='patient_link_attempt'", [uid]);
  assert.equal(await attempt({ actorUid: uid, appId: 'synthetic-app' }), true);
  assert.equal((await sql.query("SELECT count(*)::int n FROM clinic_audit_logs WHERE actor_uid=$1 AND action='patient_link_attempt' AND occurred_at > now()-interval '10 minutes'", [uid])).rows[0].n, 1);
  for (let n = 0; n < 4; n++) assert.equal(await attempt({ actorUid: uid, appId: 'synthetic-app' }), true);
  assert.equal(await attempt({ actorUid: uid, appId: 'synthetic-app' }), false);
  assert.equal((await sql.query("SELECT count(*)::int n FROM clinic_audit_logs WHERE actor_uid=$1 AND action='patient_link_attempt'", [uid])).rows[0].n, 10);
  const stored = JSON.stringify((await sql.query("SELECT * FROM clinic_audit_logs WHERE actor_uid=$1 AND action='patient_link_attempt'", [uid])).rows);
  assert.equal(stored.includes('synthetic-app'), false);
  assert.equal(stored.includes('patient_link_attempt"'), true);
}));

test('concurrent link attempts across guard instances commit at most five debits', async () => linkAttemptFixture(81, async ({ uid, guard }) => {
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => guard()({ actorUid: uid, appId: 'synthetic-app' })));
  const admitted = results.filter(row => row.status === 'fulfilled' && row.value === true).length;
  assert.ok(admitted <= 5 && admitted >= 1);
  for (const row of results) if (row.status === 'rejected') assert.equal(row.reason.code, 'unavailable');
  assert.equal((await sql.query("SELECT count(*)::int n FROM clinic_audit_logs WHERE actor_uid=$1 AND action='patient_link_attempt'", [uid])).rows[0].n, admitted);
}));

test('link attempts fail closed for inactive or unknown accounts and isolate per account', async () => linkAttemptFixture(82, async ({ uid, attempt }) => {
  const stranger = 'sql-link-attempts-82-stranger';
  await sql.query('INSERT INTO clinic_users (id, display_name, active, created_at, updated_at) VALUES ($1, $2, true, now(), now())', [stranger, 'Synthetic stranger']);
  try {
    await sql.query('UPDATE clinic_users SET active=false WHERE id=$1', [uid]);
    await assert.rejects(attempt({ actorUid: uid, appId: 'synthetic-app' }), error => error.code === 'unavailable');
    await sql.query('UPDATE clinic_users SET active=true WHERE id=$1', [uid]);
    await assert.rejects(attempt({ actorUid: 'sql-link-attempts-unknown', appId: 'synthetic-app' }), error => error.code === 'unavailable');
    for (let n = 0; n < 5; n++) assert.equal(await attempt({ actorUid: uid, appId: 'synthetic-app' }), true);
    assert.equal(await attempt({ actorUid: uid, appId: 'synthetic-app' }), false);
    for (let n = 0; n < 5; n++) assert.equal(await attempt({ actorUid: stranger, appId: 'synthetic-app' }), true);
    assert.equal((await sql.query("SELECT count(*)::int n FROM clinic_audit_logs WHERE actor_uid=$1 AND action='patient_link_attempt'", [uid])).rows[0].n, 5);
  } finally {
    await sql.query('DELETE FROM clinic_audit_logs WHERE actor_uid=$1', [stranger]);
    await sql.query('DELETE FROM clinic_users WHERE id=$1', [stranger]);
  }
}));

test('link-attempt IAM mutation denies anonymous and every browser role', async () => {
  const before = (await sql.query("SELECT count(*)::int n FROM clinic_audit_logs WHERE action='patient_link_attempt'")).rows[0].n;
  for (const impersonate of [{ unauthenticated: true }, ...['patient', 'manager', 'doctor', 'admin'].map(role => ({ authClaims: { sub: `link-attempt-${role}`, role } }))]) {
    await assert.rejects(admin.executeMutation('ConsumePatientLinkAttempt', { actorUid: 'spoof' }, { impersonate }), accessDenied);
  }
  assert.equal((await sql.query("SELECT count(*)::int n FROM clinic_audit_logs WHERE action='patient_link_attempt'")).rows[0].n, before);
});

