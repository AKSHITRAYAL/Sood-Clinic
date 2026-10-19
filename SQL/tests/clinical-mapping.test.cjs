const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixtures, targetSnapshot, patientTargetSnapshot } = require('../migration/fixtures.cjs');
const { mapClinicalRecord, rehearse, legacyUuid } = require('../migration/rehearsal.cjs');
const { prepareMigrationTimestamps } = require('../migration/instant-preservation.cjs');
const history = fixtures.find(row => row.path.includes('/medicalHistory/'));
const document = fixtures.find(row => row.path.includes('/medicalDocuments/'));
const options = { targetSnapshot, patientTargetSnapshot, clinicalTargetSnapshot: { complete: true, histories: [], documents: [] } };
const replace = record => fixtures.filter(row => row.path !== record.path).concat(record);

test('clinical history and document candidates preserve private source fields without grants or fabricated visits', () => {
  const records = structuredClone(fixtures);
  const h = records.find(row => row.path === history.path); Object.assign(h.data, { date: '2026-10-18', details: 'Synthetic legacy clinical details' });
  const d = records.find(row => row.path === document.path);
  Object.assign(d.data, { name: '', category: 'Report', details: 'Synthetic private description', contentType: 'application/pdf', size: 1234, url: 'https://example.test/private-report?token=synthetic-only' });
  for (const record of [h, d]) {
    const result = mapClinicalRecord(record, records, options);
    assert.equal(result.status, 'mapped'); assert.equal(result.readyForApply, false);
    const row = Object.values(result.rows)[0];
    assert.equal(row.patientId, patientTargetSnapshot.patients[0].id);
    assert.equal(row.doctorId, targetSnapshot.doctors[0].id);
    assert.equal(row.legacyId, record.path);
    assert.deepEqual(result.source, record);
    assert.equal(result.coverage.blocked, 0);
    assert.equal(result.rows.patientLinks, undefined); assert.equal(result.rows.visit, undefined);
    assert.ok(result.blockers.includes('CLINICAL_SCOPE_REVIEW'));
    assert.ok(result.blockers.includes('CLINICAL_CUTOVER_PENDING'));
    assert.doesNotMatch(JSON.stringify(result.coverage), /Synthetic|fixture|example.test/);
  }
  const mapped = mapClinicalRecord(d, records, options).rows.legacyMedicalDocument;
  assert.equal(mapped.name, ''); assert.equal(mapped.visibleToPatient, false);
  assert.equal(mapped.legacyUrl, d.data.url); assert.equal(mapped.sizeBytes, 1234);
  assert.equal(mapped.details, d.data.details); assert.equal(mapped.category, 'Report');
  assert.equal(mapClinicalRecord(h, records, options).rows.legacyMedicalHistory.legacyDate, '2026-10-18');
});

test('qualified identities reuse existing metadata and never adopt/reparent on contact or child-ID equality', () => {
  const candidate = mapClinicalRecord(history, fixtures, options);
  const row = candidate.rows.legacyMedicalHistory;
  const snapshot = { complete: true, histories: [{ id: '00000000-0000-4000-8000-000000000090', legacyId: history.path, patientId: row.patientId, doctorId: row.doctorId }], documents: [] };
  const mapped = mapClinicalRecord(history, fixtures, { ...options, clinicalTargetSnapshot: snapshot });
  assert.equal(mapped.rows.legacyMedicalHistory.id, snapshot.histories[0].id);
  assert.equal(mapped.identityDecision, 'reuse_existing');
  for (const field of ['patientId', 'doctorId']) {
    const other = structuredClone(snapshot); other.histories[0][field] = '00000000-0000-4000-8000-000000000099';
    assert.equal(mapClinicalRecord(history, fixtures, { ...options, clinicalTargetSnapshot: other }).reason, 'TARGET_RELATIONSHIP_CONFLICT');
  }
  const collision = structuredClone(snapshot); Object.assign(collision.histories[0], { id: legacyUuid('medical_history', history.path), legacyId: null });
  assert.equal(mapClinicalRecord(history, fixtures, { ...options, clinicalTargetSnapshot: collision }).reason, 'TARGET_ID_CONFLICT');
  assert.notEqual(legacyUuid('medical_history', history.path), legacyUuid('medical_history', history.path.replace('fixture-account', 'other-patient')));
});

test('incomplete, duplicate, oversized and malformed target metadata fails closed without PHI', () => {
  const row = { id: '00000000-0000-4000-8000-000000000090', legacyId: history.path, patientId: patientTargetSnapshot.patients[0].id, doctorId: null };
  for (const patch of [{ complete: false }, { documents: undefined }, { extra: true }, { histories: [row, row] }, { histories: Array(10001).fill(row) }, { histories: [{ ...row, legacyId: document.path }] }, { histories: [{ ...row, patientId: null }] }]) {
    const result = mapClinicalRecord(history, fixtures, { ...options, clinicalTargetSnapshot: { complete: true, histories: [], documents: [], ...patch } });
    assert.equal(result.status, 'rejected');
    assert.doesNotMatch(JSON.stringify(result), /Synthetic|fixture|00000000|example.test/);
  }
});

test('patient/doctor dependencies require explicit references, never current user/contact inference', () => {
  assert.equal(mapClinicalRecord(history, fixtures.filter(row => row.path !== 'patients/fixture-account'), options).reason, 'MISSING_REFERENCE');
  const missing = { ...history, data: { ...history.data, doctorId: 'unknown' } };
  assert.equal(mapClinicalRecord(missing, replace(missing), options).reason, 'MISSING_REFERENCE');
  const noDoctor = structuredClone(history); delete noDoctor.data.doctorId;
  const result = mapClinicalRecord(noDoctor, replace(noDoctor), options);
  assert.equal(result.rows.legacyMedicalHistory.doctorId, null);
  assert.ok(result.blockers.includes('CLINICAL_DOCTOR_MISSING'));
  assert.ok(result.blockers.includes('CLINICAL_SCOPE_REVIEW'));
  assert.equal(mapClinicalRecord(history, [...fixtures, history], options).reason, 'DUPLICATE_SOURCE');
});

test('missing visibility/timestamps stay NULL and blocked rather than defaulting to patient sharing', () => {
  const record = structuredClone(document); delete record.data.visibleToPatient; delete record.data.createdAt;
  const result = mapClinicalRecord(record, replace(record), options);
  assert.equal(result.rows.legacyMedicalDocument.visibleToPatient, null);
  assert.equal(result.rows.legacyMedicalDocument.createdAt, null);
  assert.ok(result.blockers.includes('DOCUMENT_VISIBILITY_REVIEW'));
  assert.ok(result.blockers.includes('SOURCE_CREATED_AT_MISSING'));
  assert.ok(result.blockers.includes('DOCUMENT_STORAGE_VERIFICATION_PENDING'));
  const unchecked = mapClinicalRecord(document, fixtures, { targetSnapshot, patientTargetSnapshot });
  assert.ok(unchecked.blockers.includes('CLINICAL_TARGET_IDENTITY_PENDING'));
});

test('invalid dates, unsafe URLs/paths, unsupported metadata and coercible values are not silently repaired', () => {
  for (const patch of [{ url: 'javascript:alert(1)' }, { url: 'https://user:secret@example.test/report' }, { storagePath: '../private.pdf' }, { storagePath: '/private.pdf' }, { storagePath: 'https://example.test/file' }, { storagePath: 'a\\b' }, { visibleToPatient: 'true' }, { size: 1.5 }, { size: -1 }, { size: '12' }, { size: 2147483648 }, { contentType: 'not a mime' }, { refreshToken: 'synthetic-secret' }]) {
    const record = { ...document, data: { ...document.data, ...patch } };
    assert.equal(mapClinicalRecord(record, replace(record), options).status, 'rejected');
  }
  for (const patch of [{ date: '2026-02-30' }, { notes: [] }, { createdAt: 'tomorrow' }]) {
    const record = { ...history, data: { ...history.data, ...patch } };
    assert.equal(mapClinicalRecord(record, replace(record), options).status, 'rejected');
  }
});

test('clinical timestamps receive exact evidence without parsing health text or clearing blockers', () => {
  const record = { ...history, data: { ...history.data, notes: '2026-10-19T00:00:00.123456789Z', createdAt: { seconds: 1792368000, nanoseconds: 123456789 } } };
  const result = mapClinicalRecord(record, replace(record), options);
  assert.equal(result.status, 'mapped');
  assert.ok(result.blockers.includes('TARGET_TIMESTAMP_PRECISION_LOSS'));
  const prepared = prepareMigrationTimestamps(result);
  assert.equal(prepared.status, 'prepared');
  assert.equal(prepared.rows.legacyMedicalHistory.notes, record.data.notes);
  assert.equal(prepared.rows.legacySourceInstants[0].exactValue, record.data.notes);
  assert.ok(prepared.blockers.includes('CLINICAL_SCOPE_REVIEW'));
  assert.equal(prepared.readyForApply, false);
});

test('clinical assessment reports counts only and remains deferred with zero writes', () => {
  const result = rehearse(fixtures, options);
  assert.equal(result.clinicalAssessment.candidates, 2);
  assert.equal(result.clinicalAssessment.rejected, 0);
  assert.equal(result.writes, 0); assert.equal(result.readyForApply, 0);
  assert.equal(result.mapped, 3);
  assert.deepEqual(result.clinicalAssessment, rehearse([...fixtures].reverse(), { ...options, pageSize: 1 }).clinicalAssessment);
  assert.doesNotMatch(JSON.stringify(result), /Synthetic|fixture|example.test|rows|patientId/);
});
