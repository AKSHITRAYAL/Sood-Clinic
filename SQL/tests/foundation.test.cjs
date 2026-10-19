const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { localDataConnect, seed, functionsRequire } = require('../scripts/local.cjs');
const toolsRequire = createRequire(require.resolve('firebase-tools/package.json'));
const { Client } = toolsRequire('pg');
let sql;
let clinic;
let admin;
const accessDenied = (error) => /permission.denied|unauthenticated|not authorized|not allowed|NO_ACCESS/i.test(error.message);

before(async () => {
  admin = localDataConnect();
  clinic = localDataConnect('clinic');
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
  assert.equal(result.rows.length, 33);
});

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

async function linkingFixture(suffix) {
  const { getAuth } = functionsRequire('firebase-admin/auth');
  const { createPatientLinking, sqlPatientLinkStore } = require('../../functions/lib/patientLinking');
  const auth = getAuth(admin.app);
  const uid = `sql-link-${suffix}`;
  const patientId = `40000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
  await auth.createUser({ uid, email: `link-${suffix}@example.test`, emailVerified: true });
  await sql.query('INSERT INTO clinic_users (id, display_name, active, created_at, updated_at) VALUES ($1, $2, true, now(), now())', [uid, 'Synthetic account']);
  await sql.query('INSERT INTO clinic_patients (id, uhid, display_name, phone, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now())', [patientId, `TEST-LINK-${suffix}`, 'Synthetic patient', '0000000000']);
  const service = createPatientLinking({ auth, store: sqlPatientLinkStore(admin) });
  const staff = (data) => ({ auth: { uid: 'sql-lifecycle-administrator', token: { role: 'admin', auth_time: Math.floor(Date.now() / 1000) } }, data });
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
