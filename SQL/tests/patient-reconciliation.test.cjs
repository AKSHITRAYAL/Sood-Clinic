const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixtures } = require('../migration/fixtures.cjs');
const { mapPatientRecord, rehearse, legacyUuid } = require('../migration/rehearsal.cjs');
const patient = fixtures.find(row => row.path === 'patients/fixture-account');
const targetId = '00000000-0000-4000-8000-000000000044';
const snapshot = () => ({ complete: true, patients: [{ id: targetId, legacyId: 'fixture-account', uhid: 'SC-999999' }] });
const replace = row => fixtures.filter(item => item !== patient).concat(row);

test('patient projection reuses legacy identity but never derives ownership from UID or contact', () => {
  const result = mapPatientRecord(patient, fixtures, snapshot());
  assert.equal(result.status, 'mapped');
  assert.equal(result.rows.patient.id, targetId);
  assert.equal(result.rows.patient.legacyId, 'fixture-account');
  assert.notEqual(result.rows.patient.id, 'fixture-account');
  assert.equal(result.identityDecision, 'reuse_existing');
  assert.equal(result.readyForApply, false);
  assert.equal(result.rows.patientLinks, undefined);
  assert.ok(result.blockers.includes('PATIENT_OWNERSHIP_REVIEW'));
  assert.ok(result.blockers.includes('SOURCE_CREATED_AT_MISSING'));
  assert.deepEqual(result.source, patient);
  assert.equal(mapPatientRecord(patient, fixtures).rows.patient.id, legacyUuid('patient', 'fixture-account'));
  const compact = snapshot(); compact.patients[0].id = targetId.replaceAll('-', '');
  assert.equal(mapPatientRecord(patient, fixtures, compact).rows.patient.id, targetId);
});

test('demographics and self-reported health text are separated and empty strings preserved', () => {
  const row = { ...patient, data: { ...patient.data, maritalStatus: '', emergencyContactName: 'Synthetic contact', emergencyContactPhone: '', currentMedications: '', healthNotes: 'Synthetic health note', createdBy: 'fixture-actor', recordSource: 'staff_registry' } };
  const result = mapPatientRecord(row, replace(row), snapshot());
  assert.equal(result.rows.patient.title, '');
  assert.equal(result.rows.patient.maritalStatus, '');
  assert.equal(result.rows.patient.addressLine1, row.data.addressLine1);
  assert.equal(result.rows.patient.emergencyContactPhone, '');
  assert.equal(result.rows.patient.legacyCreatedBy, 'fixture-actor');
  assert.equal(result.rows.patientReportedProfile.allergies, row.data.allergies);
  assert.equal(result.rows.patientReportedProfile.currentMedications, '');
  assert.equal(result.rows.patientReportedProfile.healthNotes, row.data.healthNotes);
  for (const key of ['allergies', 'currentMedications', 'healthNotes', 'uid', 'linkedUids']) assert.equal(Object.hasOwn(result.rows.patient, key), false);
});

test('UHID collisions, malformed identities and partial target metadata cannot be adopted', () => {
  const duplicate = { ...patient, path: 'patients/other' };
  assert.equal(mapPatientRecord(patient, [...fixtures, duplicate], snapshot()).reason, 'DUPLICATE_UHID');
  assert.equal(mapPatientRecord(patient, [...fixtures, patient], snapshot()).reason, 'DUPLICATE_SOURCE');
  for (const alter of [
    value => { value.complete = false; },
    value => { value.patients[0].legacyId = null; },
    value => { value.patients[0].id = 'bad'; },
    value => { value.patients.push({ ...value.patients[0] }); },
    value => { value.patients[0].email = 'secret@example.test'; },
    value => { value.patients[0].uhid = 'SC-000001'; },
  ]) {
    const targets = snapshot(); alter(targets);
    assert.equal(mapPatientRecord(patient, fixtures, targets).status, 'rejected');
  }
  const collision = { complete: true, patients: [{ id: legacyUuid('patient', 'fixture-account'), legacyId: 'other', uhid: 'SC-000001' }] };
  assert.equal(mapPatientRecord(patient, fixtures, collision).reason, 'TARGET_ID_CONFLICT');
});

test('patient values are validated without coercion, truncation, repair or dropping unknown fields', () => {
  for (const data of [{ uhid: 'invalid' }, { uhid: 'SC-000000' }, { uhid: 'SC-0000001' }, { dateOfBirth: '2025-02-29' }, { displayName: '' }, { phone: 1234567890 }, { healthNotes: 'a'.repeat(2001) }, { linkedUids: [42] }, { emergencyContactName: { name: 'private' } }, { unknownClinicalField: 'private' }]) {
    const row = { ...patient, data: { ...patient.data, ...data } };
    assert.equal(mapPatientRecord(row, replace(row), snapshot()).status, 'rejected');
  }
  const emptyDate = { ...patient, data: { ...patient.data, dateOfBirth: '' } };
  const mapped = mapPatientRecord(emptyDate, replace(emptyDate), snapshot());
  assert.equal(mapped.rows.patient.dateOfBirth, null);
  assert.ok(mapped.blockers.includes('EMPTY_DATE_REPRESENTATION_REVIEW'));
  const report = rehearse([patient]);
  assert.doesNotMatch(JSON.stringify(report), /fixture|Synthetic|SC-999999|example.test/);
});

test('coverage accounts for timestamps, derived keys and ownership without silently importing access grants', () => {
  const row = { ...patient, data: { ...patient.data, uid: 'fixture-account', displayNameLower: 'synthetic patient', phoneNormalized: '0000000000', updatedAt: { seconds: 1792348200, nanoseconds: 123456789 } } };
  const result = mapPatientRecord(row, replace(row), snapshot());
  assert.ok(result.blockers.includes('TARGET_TIMESTAMP_PRECISION_LOSS'));
  for (const key of ['uid', 'linkedUids', 'displayNameLower', 'phoneNormalized', 'updatedAt']) assert.ok(result.coverage.fields.some(field => field.source === key));
  assert.doesNotMatch(JSON.stringify(result.coverage), /fixture|synthetic patient|0000000000/);
});

test('no health row is fabricated when no health field was supplied', () => {
  const row = structuredClone(patient);
  delete row.data.allergies;
  assert.equal(mapPatientRecord(row, replace(row), snapshot()).rows.patientReportedProfile, undefined);
});

test('patient assessment reporting stays count-only and never changes deferred module disposition', () => {
  const report = rehearse(fixtures, { patientTargetSnapshot: snapshot() });
  assert.equal(report.mapped, 3);
  assert.equal(report.patientAssessment.assessed, 1);
  assert.equal(report.patientAssessment.candidates, 1);
  assert.equal(report.patientAssessment.reused, 1);
  assert.equal(report.writes, 0);
  assert.equal(report.readyForApply, 0);
  assert.deepEqual(report.patientAssessment, rehearse([...fixtures].reverse(), { pageSize: 1, patientTargetSnapshot: snapshot() }).patientAssessment);
});
