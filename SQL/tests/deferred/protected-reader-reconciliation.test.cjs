// DEFERRED (2026-10-30): parked with the deferred schema models and connector
// operations. Not run by `npm run sql:test` / `npm run test:migration`.
// Requires the deferred schema models/connectors to be restored (or the SQL
// emulator to serve them) before it can pass; against the reduced first-release
// schema it fails honestly. Restore it with SQL/dataconnect/deferred/.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomBytes, createHmac, createCipheriv, createDecipheriv } = require('node:crypto');
const { fixtures, patientTargetSnapshot } = require('../migration/fixtures.cjs');
const { encodeInspectionSource, openInspectionSource } = require('../migration/protected-reader.cjs');
const records = fixtures.filter(row => !/^integrations\/|^integrationOAuthStates\//.test(row.path));

async function sandbox(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'clinic-reader-'));
  await fs.chmod(dir, 0o700);
  try { await run(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
const decisions = page => page.records.map((_, index) => ({ index: page.start + index, disposition: 'blocked', reasons: ['MODULE_NOT_READY'] }));
const save = (file, bytes) => fs.writeFile(file, bytes, { mode: 0o600, flag: 'wx' });

const contentSnapshot = () => ({ complete: true, tables: ['Branch'], rows: [
  { entityType: 'Branch', key: ['fixture-branch'], version: 'opaque-revision-1', content: { name: 'SYNTHETIC_PRIVATE_TARGET', active: false, sortOrder: 0, note: null } },
] });

const groups = {
  Config: { path: /^clinic\/publicConfig$/, mapper: 'mapBookingConfig', kinds: { clinicSettings: ['ClinicSettings', ['id']], services: ['Service', ['id']] } },
  Schedule: { path: /^(doctorSchedules|scheduleExceptions)\/[^/]+$/, mapper: 'mapScheduleRecord', kinds: { scheduleState: ['DoctorScheduleState', ['doctorId']], doctorSchedules: ['DoctorSchedule', ['id']], scheduleException: ['ScheduleException', ['id']], exceptionWindows: ['ExceptionWindow', ['id']] } },
  Patient: { path: /^patients\/[^/]+$/, mapper: 'mapPatientRecord', primary: 'patient', kinds: { patient: ['Patient', ['id']], patientReportedProfile: ['PatientReportedProfile', ['patientId']] } },
  Clinical: { path: /^patients\/[^/]+\/medical(?:History|Documents)\/[^/]+$/, mapper: 'mapClinicalRecord', kinds: { legacyMedicalHistory: ['LegacyMedicalHistory', ['id']], legacyMedicalDocument: ['LegacyMedicalDocument', ['id']] } },
  Appointment: { path: /^appointments\/[^/]+(?:\/events\/[^/]+)?$/, mapper: 'mapAppointmentRecord', kinds: { appointment: ['Appointment', ['id']], appointmentEvent: ['AppointmentEvent', ['id']], appointmentPrivateDetails: ['AppointmentPrivateDetails', ['appointmentId']], appointmentLegacySlots: ['AppointmentLegacySlot', ['appointmentId', 'ordinal']] } },
  Experience: { path: /^(patientFeedback|auditLogs)\/[^/]+$/, mapper: 'mapExperienceRecord', kinds: { legacyPatientFeedback: ['LegacyPatientFeedback', ['id']], legacyAuditRecord: ['LegacyAuditRecord', ['id']] } },
  Registry: { path: /^(counters\/patientUhid|bookingRequests\/[^/]+)$/, mapper: 'mapRegistryRecord', kinds: { legacyUhidCounter: ['LegacyUhidCounter', ['id']], legacyBookingRequest: ['LegacyBookingRequest', ['id']] } },
};
function groupContent(name, rows = records, omitIdentity = false) {
  const { fixtures: _fixtures, ...targets } = require('../migration/fixtures.cjs');
  if (omitIdentity) delete targets[name === 'Config' ? 'serviceTargetSnapshot' : 'scheduleTargetSnapshot'];
  const mappers = require('../migration/rehearsal.cjs');
  const { prepareMigrationTimestamps } = require('../migration/instant-preservation.cjs');
  const group = groups[name]; const kinds = { ...group.kinds, legacySourceInstants: ['LegacySourceInstant', ['entityType', 'entityId', 'field']] };
  const snapshot = { complete: true, tables: Object.values(kinds).map(([type]) => type), rows: [] };
  for (const record of rows.filter(row => row.source === 'firestore' && group.path.test(row.path))) {
    const mapped = mappers[group.mapper](record, rows, name === 'Patient' ? targets.patientTargetSnapshot : name === 'Config' ? targets.serviceTargetSnapshot : targets);
    const candidate = prepareMigrationTimestamps(mapped);
    assert.equal(candidate.status, 'prepared');
    for (const [kind, payload] of Object.entries(candidate.rows)) {
      const [entityType, keys] = kinds[kind];
      for (const content of Array.isArray(payload) ? payload : [payload]) snapshot.rows.push({ entityType, key: keys.map(field => content[field]), version: 'synthetic-version', content });
    }
  }
  return { ...targets, contentSnapshot: snapshot };
}
for (const name of Object.keys(groups)) {
  test(`${name} candidate comparison preserves exact rows/evidence and remains private and blocked`, async () => sandbox(async dir => {
    const key = randomBytes(32); const targets = groupContent(name); const file = path.join(dir, 'source.bin');
    await save(file, encodeInspectionSource(records, targets, key));
    const report = (await openInspectionSource(file, key))[`reconcile${name}Candidates`]();
    assert.ok(targets.contentSnapshot.rows.length > 0);
    assert.equal(report.rows.equal, targets.contentSnapshot.rows.length); assert.equal(report.rows.conflicting, 0);
    assert.equal(report.rows.unaccounted, 0); assert.equal(report.applied, 0); assert.equal(report.grants, 0); assert.equal(report.readyForApply, false);
    assert.equal(report.sources.inspected, ['Patient', 'Config'].includes(name) ? 1 : 2);
    assert.ok(report.blockers.includes('ATOMIC_VERSION_GUARD_PENDING'));
    assert.ok(!JSON.stringify(report).includes('fixture')); assert.ok(!JSON.stringify(report).includes('Synthetic'));
    if (name === 'Patient') assert.ok(report.blockers.includes('CLINIC_LINK_VERIFICATION_REQUIRED'));
    if (name === 'Clinical') assert.ok(report.blockers.includes('DOCUMENT_STORAGE_VERIFICATION_PENDING'));
    if (name === 'Experience') assert.ok(report.blockers.includes('FEEDBACK_PUBLICATION_CONSENT_REVIEW'));
    if (name === 'Registry') assert.ok(report.blockers.includes('REQUEST_REPLAY_DISABLED'));
    if (name === 'Config') assert.ok(report.blockers.includes('SETTINGS_SINGLETON_AUTHORITY_REVIEW'));
    if (name === 'Schedule') assert.ok(report.blockers.includes('LEGACY_CLINIC_SCHEDULE_REVIEW'));
  }));
}

test('patient content equality never clears disabled-account ownership review or grants links', async () => sandbox(async dir => {
  const rows = structuredClone(records); rows.find(row => row.source === 'auth').data.disabled = true;
  const key = randomBytes(32); const targets = groupContent('Patient', rows); const file = path.join(dir, 'source.bin');
  await save(file, encodeInspectionSource(rows, targets, key));
  const report = (await openInspectionSource(file, key)).reconcilePatientCandidates();
  assert.equal(report.rows.equal, targets.contentSnapshot.rows.length);
  assert.ok(report.blockers.includes('ACCOUNT_DISABLED')); assert.ok(report.blockers.includes('PATIENT_OWNERSHIP_REVIEW'));
  assert.equal(report.grants, 0); assert.equal(report.readyForApply, false);
}));

test('patient private-profile conflicts and missing reused identity are not repaired', async () => sandbox(async dir => {
  const key = randomBytes(32); const targets = groupContent('Patient'); const file = path.join(dir, 'source.bin');
  targets.contentSnapshot.rows = targets.contentSnapshot.rows.filter(row => row.entityType !== 'Patient');
  targets.contentSnapshot.rows.find(row => row.entityType === 'PatientReportedProfile').content.allergies = 'SYNTHETIC_PRIVATE_CONFLICT';
  await save(file, encodeInspectionSource(records, targets, key));
  const report = (await openInspectionSource(file, key)).reconcilePatientCandidates();
  assert.equal(report.rows.absent, 1); assert.equal(report.rows.conflicting, 1);
  assert.ok(report.blockers.includes('TARGET_IDENTITY_CONTENT_MISMATCH')); assert.ok(!JSON.stringify(report).includes('SYNTHETIC_PRIVATE_CONFLICT'));
}));

test('non-catalogue scopes detect target changes without leaking payloads', async () => sandbox(async dir => {
  const key = randomBytes(32);
  for (const name of ['Clinical', 'Appointment', 'Experience', 'Registry']) {
    const targets = groupContent(name); targets.contentSnapshot.rows[0].content.unexpected = 'DO_NOT_LEAK';
    const file = path.join(dir, `${name}.bin`); await save(file, encodeInspectionSource(records, targets, key));
    const report = (await openInspectionSource(file, key))[`reconcile${name}Candidates`]();
    assert.equal(report.rows.conflicting, 1); assert.equal(report.status, 'conflict'); assert.equal(report.applied, 0);
    assert.ok(!JSON.stringify(report).includes('DO_NOT_LEAK'));
  }
}));

test('per-row schedule/service decisions cannot adopt equal-content new keys', async () => sandbox(async dir => {
  const key = randomBytes(32);
  for (const name of ['Config', 'Schedule']) {
    const targets = groupContent(name, records, true); const file = path.join(dir, `${name}.bin`);
    await save(file, encodeInspectionSource(records, targets, key));
    const report = (await openInspectionSource(file, key))[`reconcile${name}Candidates`]();
    assert.ok(report.rows.conflicting > 0); assert.ok(report.blockers.includes('TARGET_UNLINKED_KEY_COLLISION'));
    assert.ok(report.blockers.includes('TARGET_IDENTITY_UNCHECKED')); assert.equal(report.readyForApply, false);
  }
}));

test('private patient and clinical malformed source values remain rejected before content equality', async () => sandbox(async dir => {
  const key = randomBytes(32);
  for (const name of ['Patient', 'Clinical']) {
    const targets = groupContent(name); const rows = structuredClone(records);
    if (name === 'Patient') rows.find(row => /^patients\/[^/]+$/.test(row.path)).data.allergies = { text: 'PRIVATE_INVALID_VALUE' };
    else rows.find(row => row.path.includes('/medicalDocuments/')).data.url = 'javascript:PRIVATE_INVALID_VALUE';
    const file = path.join(dir, `${name}.bin`); await save(file, encodeInspectionSource(rows, targets, key));
    const report = (await openInspectionSource(file, key))[`reconcile${name}Candidates`]();
    assert.equal(report.sources.rejected, 1); assert.equal(report.grants, 0); assert.equal(report.applied, 0);
    assert.ok(!JSON.stringify(report).includes('PRIVATE_INVALID_VALUE'));
  }
}));

function catalogContent(identity = require('../migration/fixtures.cjs').targetSnapshot) {
  const { mapCatalogRecord } = require('../migration/rehearsal.cjs');
  const { prepareMigrationTimestamps } = require('../migration/instant-preservation.cjs');
  const kinds = { branch: ['Branch', ['id']], department: ['Department', ['id']], doctor: ['Doctor', ['id']], doctorDepartments: ['DoctorDepartment', ['doctorId', 'departmentId']], legacySourceInstants: ['LegacySourceInstant', ['entityType', 'entityId', 'field']] };
  const snapshot = { complete: true, tables: Object.values(kinds).map(([type]) => type), rows: [] };
  for (const record of records.filter(row => /^(branches|departments|doctors)\/[^/]+$/.test(row.path))) {
    const candidate = prepareMigrationTimestamps(mapCatalogRecord(record, records, identity));
    for (const [kind, payload] of Object.entries(candidate.rows)) {
      const [entityType, keys] = kinds[kind];
      for (const content of Array.isArray(payload) ? payload : [payload]) snapshot.rows.push({ entityType, key: keys.map(field => content[field]), version: 'synthetic-version', content });
    }
  }
  return snapshot;
}

test('catalogue candidate reconciliation covers explicit identities, memberships and exact evidence without apply', async () => sandbox(async dir => {
  const key = randomBytes(32); const snapshot = catalogContent(); const file = path.join(dir, 'catalog.bin');
  const targetSnapshot = require('../migration/fixtures.cjs').targetSnapshot;
  await save(file, encodeInspectionSource(records, { targetSnapshot, contentSnapshot: snapshot }, key));
  const report = (await openInspectionSource(file, key)).reconcileCatalogCandidates();
  assert.equal(report.sources.inspected, 3); assert.equal(report.sources.outOfScope, records.length - 3);
  assert.equal(report.rows.equal, snapshot.rows.length); assert.equal(report.rows.conflicting, 0); assert.equal(report.rows.unaccounted, 0);
  assert.equal(report.applied, 0); assert.equal(report.readyForApply, false);
  assert.ok(report.blockers.includes('EXACT_TIMESTAMP_TRANSACTION_PENDING'));
  assert.ok(!JSON.stringify(report).includes('fixture'));
}));

test('catalogue conflicting content and omitted target columns are never proposed as overwrites', async () => sandbox(async dir => {
  const key = randomBytes(32); const snapshot = catalogContent(); const file = path.join(dir, 'catalog.bin');
  snapshot.rows.find(row => row.entityType === 'Branch').content.name = 'SYNTHETIC_NEWER_SQL_NAME';
  delete snapshot.rows.find(row => row.entityType === 'Department').content.description;
  const targetSnapshot = require('../migration/fixtures.cjs').targetSnapshot;
  await save(file, encodeInspectionSource(records, { targetSnapshot, contentSnapshot: snapshot }, key));
  const report = (await openInspectionSource(file, key)).reconcileCatalogCandidates();
  assert.equal(report.rows.conflicting, 2); assert.ok(report.blockers.includes('TARGET_CANDIDATE_CONTENT_CONFLICT'));
  assert.equal(report.readyForApply, false); assert.ok(!JSON.stringify(report).includes('SYNTHETIC_NEWER_SQL_NAME'));
}));

test('catalogue missing reused identities and unaccounted existing target rows retain conflicts', async () => sandbox(async dir => {
  const key = randomBytes(32); const snapshot = catalogContent(); const file = path.join(dir, 'catalog.bin');
  snapshot.rows = snapshot.rows.filter(row => row.entityType !== 'Branch');
  snapshot.rows.push({ entityType: 'Branch', key: ['unrelated'], version: 'synthetic-version', content: { name: 'Do not delete' } });
  const targetSnapshot = require('../migration/fixtures.cjs').targetSnapshot;
  await save(file, encodeInspectionSource(records, { targetSnapshot, contentSnapshot: snapshot }, key));
  const report = (await openInspectionSource(file, key)).reconcileCatalogCandidates();
  assert.equal(report.rows.absent, 1); assert.equal(report.rows.unaccounted, 1);
  assert.ok(report.blockers.includes('TARGET_IDENTITY_CONTENT_MISMATCH'));
  assert.ok(report.blockers.includes('TARGET_CONTENT_UNACCOUNTED'));
}));

test('catalogue new deterministic keys cannot adopt existing target rows even when content equals', async () => sandbox(async dir => {
  const key = randomBytes(32); const snapshot = catalogContent(undefined); const file = path.join(dir, 'catalog.bin');
  // Explicitly generate new-ID candidates rather than the helper default's existing identities.
  const { mapCatalogRecord } = require('../migration/rehearsal.cjs');
  const { prepareMigrationTimestamps } = require('../migration/instant-preservation.cjs');
  const branch = records.find(row => row.path.startsWith('branches/'));
  const content = prepareMigrationTimestamps(mapCatalogRecord(branch, records)).rows.branch;
  snapshot.rows = [{ entityType: 'Branch', key: [content.id], version: 'synthetic-version', content }];
  await save(file, encodeInspectionSource(records, { contentSnapshot: snapshot }, key));
  const report = (await openInspectionSource(file, key)).reconcileCatalogCandidates();
  assert.ok(report.blockers.includes('TARGET_UNLINKED_KEY_COLLISION')); assert.equal(report.readyForApply, false);
}));


test('catalogue reconciliation keeps non-catalogue rows and timestamp evidence out of scope', async () => sandbox(async dir => {
  const key = randomBytes(32); const snapshot = catalogContent(); const file = path.join(dir, 'catalog.bin');
  snapshot.tables.push('Patient');
  snapshot.rows.push({ entityType: 'Patient', key: ['private-patient'], version: 'v1', content: {} });
  snapshot.rows.push({ entityType: 'LegacySourceInstant', key: ['Patient', 'private-patient', 'updatedAt'], version: 'v1', content: { entityType: 'Patient' } });
  const targetSnapshot = require('../migration/fixtures.cjs').targetSnapshot;
  await save(file, encodeInspectionSource(records, { targetSnapshot, contentSnapshot: snapshot }, key));
  const report = (await openInspectionSource(file, key)).reconcileCatalogCandidates();
  assert.equal(report.rows.outOfScope, 2); assert.equal(report.rows.unaccounted, 0);
  const missing = path.join(dir, 'missing.bin'); await save(missing, encodeInspectionSource(records, {}, key));
  assert.throws((await openInspectionSource(missing, key)).reconcileCatalogCandidates, /CANDIDATE_RECONCILIATION_REJECTED/);
}));























