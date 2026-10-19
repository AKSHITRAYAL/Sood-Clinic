const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixtures, patientTargetSnapshot } = require('../migration/fixtures.cjs');
const { assessPatientOwnership, mapPatientRecord, rehearse } = require('../migration/rehearsal.cjs');
const patient = fixtures.find(row => row.path === 'patients/fixture-account');
const account = fixtures.find(row => row.source === 'auth');
const options = { patientTargetSnapshot };
const replace = row => fixtures.filter(item => item.source !== row.source || item.path !== row.path).concat(row);

test('legacy path and linked UID are private claims, never ownership proof or link grants', () => {
  const result = assessPatientOwnership(patient, fixtures, options);
  assert.equal(result.status, 'assessed'); assert.equal(result.readyForApply, false); assert.equal(result.grants, 0);
  assert.equal(result.patientId, patientTargetSnapshot.patients[0].id);
  assert.equal(result.claims.length, 1);
  assert.deepEqual(result.claims[0].sources, ['legacy_document_path', 'linkedUids']);
  assert.equal(result.claims[0].decision, 'review_required');
  assert.ok(result.blockers.includes('PATIENT_OWNERSHIP_REVIEW'));
  assert.ok(result.blockers.includes('AUTH_LIVE_REVALIDATION_PENDING'));
  assert.equal(result.rows, undefined); assert.deepEqual(result.source, patient);
});

test('staff, disabled, unverified, forced and missing Auth accounts cannot become approved links', () => {
  for (const [patch, reason] of [[{ customClaims: { role: 'admin' } }, 'ACCOUNT_STAFF_EXCLUDED'], [{ customClaims: { role: 'receptionist' } }, 'ACCOUNT_STAFF_EXCLUDED'], [{ disabled: true }, 'ACCOUNT_DISABLED'], [{ emailVerified: false }, 'ACCOUNT_EMAIL_UNVERIFIED'], [{ customClaims: { forcePasswordChange: true } }, 'ACCOUNT_PASSWORD_CHANGE_REQUIRED'], [{ customClaims: { role: 'unrecognized' } }, 'ACCOUNT_ROLE_REVIEW']]) {
    const row = { ...account, data: { ...account.data, ...patch } };
    const result = assessPatientOwnership(patient, replace(row), options);
    assert.ok(result.claims[0].blockers.includes(reason)); assert.equal(result.grants, 0);
  }
  assert.ok(assessPatientOwnership(patient, fixtures.filter(row => row.source !== 'auth'), options).claims[0].blockers.includes('ACCOUNT_NOT_IN_SNAPSHOT'));
});

test('staff-created unlinked patients remain unlinked; names and directory records create no claims', () => {
  const row = { ...patient, data: { ...patient.data, recordSource: 'staff', linkedUids: [], createdBy: { uid: 'fixture-account', role: 'manager' } } };
  const result = assessPatientOwnership(row, replace(row), options);
  assert.equal(result.status, 'assessed'); assert.equal(result.claims.length, 0); assert.equal(result.grants, 0);
  assert.ok(result.blockers.includes('UNLINKED_PATIENT_PRESERVED'));
  assert.equal(result.rows, undefined);
});

test('multiple accounts and shared family account claims require review, never inferred self/guardian roles', () => {
  const row = { ...patient, data: { ...patient.data, uid: 'other-account', linkedUids: ['fixture-account', 'other-account'] } };
  const other = { ...patient, path: 'patients/other-patient', data: { ...patient.data, uhid: 'SC-000002', recordSource: 'staff', linkedUids: ['fixture-account'] } };
  const result = assessPatientOwnership(row, [...replace(row), other], options);
  assert.equal(result.claims.length, 2);
  assert.ok(result.blockers.includes('MULTIPLE_ACCOUNT_CLAIMS_REVIEW'));
  assert.ok(result.claims.find(claim => claim.uid === 'fixture-account').blockers.includes('ACCOUNT_MULTI_PATIENT_CLAIM_REVIEW'));
  assert.ok(result.claims.every(claim => claim.relationship === undefined && claim.decision === 'review_required'));
});

test('malformed/duplicate source UIDs and Auth identities fail closed without reflecting values', () => {
  for (const data of [{ linkedUids: ['fixture-account', 'fixture-account'] }, { linkedUids: ['bad uid'] }, { uid: 42 }, { uid: '' }]) {
    const row = { ...patient, data: { ...patient.data, ...data } };
    const result = assessPatientOwnership(row, replace(row), options);
    assert.equal(result.status, 'rejected'); assert.doesNotMatch(JSON.stringify(result), /fixture|bad uid/);
  }
  for (const records of [[...fixtures, account], replace({ ...account, data: { ...account.data, uid: 'different' } }), replace({ ...account, data: { ...account.data, disabled: 'false' } })]) assert.equal(assessPatientOwnership(patient, records, options).status, 'rejected');
});

test('actual staff creator object and historical string are preserved separately, never used for access', () => {
  const row = { ...patient, data: { ...patient.data, recordSource: 'staff', linkedUids: [], createdBy: { uid: 'fixture-creator', role: 'manager' }, updatedBy: 'fixture-updater' } };
  const mapped = mapPatientRecord(row, replace(row), patientTargetSnapshot);
  assert.equal(mapped.status, 'mapped');
  assert.equal(mapped.rows.patient.legacyCreatedBy, null);
  assert.equal(mapped.rows.patient.legacyCreatedByUid, 'fixture-creator');
  assert.equal(mapped.rows.patient.legacyCreatedByRole, 'manager');
  assert.equal(mapped.rows.patient.legacyUpdatedBy, 'fixture-updater');
  assert.equal(mapped.rows.patientLinks, undefined);
  assert.ok(mapped.blockers.includes('PATIENT_CREATOR_PROVENANCE_REVIEW'));
  const legacy = { ...row, data: { ...row.data, createdBy: 'historical-actor' } };
  assert.equal(mapPatientRecord(legacy, replace(legacy), patientTargetSnapshot).rows.patient.legacyCreatedBy, 'historical-actor');
  const unknown = { ...row, data: { ...row.data, createdBy: { ...row.data.createdBy, grantRole: 'admin' } } };
  assert.equal(mapPatientRecord(unknown, replace(unknown), patientTargetSnapshot).status, 'rejected');
});

test('assessment remains bounded and source/target metadata cannot clear verification gates', () => {
  assert.equal(assessPatientOwnership(patient, Array(10001).fill(patient), options).status, 'rejected');
  const result = assessPatientOwnership(patient, fixtures, options);
  assert.ok(result.blockers.includes('AUTH_CENSUS_COMPLETENESS_PENDING'));
  assert.ok(result.blockers.includes('CLINIC_LINK_VERIFICATION_REQUIRED'));
  assert.ok(result.claims.every(claim => claim.blockers.includes('CLINIC_LINK_VERIFICATION_REQUIRED')));
  assert.equal(assessPatientOwnership(patient, fixtures, { patientTargetSnapshot: { complete: false, patients: [] } }).status, 'rejected');
});

test('ownership reports show counts/reasons only and remain deterministic with zero grants/writes', () => {
  const report = rehearse(fixtures, options);
  assert.equal(report.ownershipAssessment.assessed, 1); assert.equal(report.ownershipAssessment.claims, 1);
  assert.equal(report.ownershipAssessment.grants, 0); assert.equal(report.writes, 0);
  assert.deepEqual(report.ownershipAssessment, rehearse([...fixtures].reverse(), { ...options, pageSize: 1 }).ownershipAssessment);
  assert.doesNotMatch(JSON.stringify(report), /fixture|Synthetic|patientId|linkedUids|claims\[/);
});
