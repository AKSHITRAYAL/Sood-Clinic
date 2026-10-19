const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixtures, targetSnapshot } = require('../migration/fixtures.cjs');
const { mapCatalogRecord, rehearse, legacyUuid } = require('../migration/rehearsal.cjs');
const branchId = '00000000-0000-4000-8000-000000000001';
const departmentId = '00000000-0000-4000-8000-000000000002';
const doctorId = '00000000-0000-4000-8000-000000000003';
const branch = fixtures.find(record => record.path === 'branches/fixture-branch');
const department = fixtures.find(record => record.path === 'departments/fixture-department');
const doctor = fixtures.find(record => record.path === 'doctors/fixture-doctor');
const snapshot = () => structuredClone(targetSnapshot);

test('existing SQL IDs replace generated candidates throughout all catalog foreign keys', () => {
  const targets = snapshot();
  // SQL Connect may return compact UUIDs; normalize them before using references.
  targets.branches[0].id = branchId.replaceAll('-', '');
  const mappedBranch = mapCatalogRecord(branch, fixtures, targets);
  const mappedDepartment = mapCatalogRecord(department, fixtures, targets);
  const mappedDoctor = mapCatalogRecord(doctor, fixtures, targets);
  assert.equal(mappedBranch.rows.branch.id, branchId);
  assert.equal(mappedBranch.identityDecision, 'reuse_existing');
  assert.equal(mappedDepartment.rows.department.branchId, branchId);
  assert.equal(mappedDepartment.rows.department.id, departmentId);
  assert.equal(mappedDoctor.rows.doctor.id, doctorId);
  assert.equal(mappedDoctor.rows.doctor.branchId, branchId);
  assert.deepEqual(mappedDoctor.rows.doctorDepartments, [{ doctorId, departmentId, sortOrder: 0 }]);
  assert.equal(mappedDoctor.readyForApply, false);
});

test('only new entities receive deterministic IDs and natural-key matches never claim an unrelated row', () => {
  const targets = snapshot();
  targets.doctors = [];
  assert.equal(mapCatalogRecord(doctor, fixtures, targets).rows.doctor.id, legacyUuid('doctor', 'fixture-doctor'));
  targets.branches[0].legacyId = null;
  const denied = mapCatalogRecord(branch, fixtures, targets);
  assert.equal(denied.reason, 'TARGET_UNIQUE_CONFLICT');
  assert.doesNotMatch(JSON.stringify(denied), /FIXTURE|fixture-branch|00000000/);
});

test('incomplete, malformed and duplicate target snapshots fail closed', () => {
  for (const alter of [
    value => { value.complete = false; },
    value => { delete value.doctors; },
    value => { value.branches.push({ ...value.branches[0] }); },
    value => { value.branches[0].id = 'not-a-uuid'; },
    value => { value.branches[0].email = 'private@example.test'; },
    value => { value.departments[0].branchId = '00000000-0000-4000-8000-000000000099'; },
  ]) {
    const targets = snapshot();
    alter(targets);
    assert.equal(mapCatalogRecord(branch, fixtures, targets).status, 'rejected');
  }
});

test('a deterministic ID collision or existing relationship change requires review, never reassignment', () => {
  const collision = snapshot();
  collision.branches = [{ id: legacyUuid('branch', 'fixture-branch'), legacyId: 'unrelated', code: 'OTHER' }];
  collision.departments = []; collision.doctors = [];
  assert.equal(mapCatalogRecord(branch, fixtures, collision).reason, 'TARGET_ID_CONFLICT');
  const moved = snapshot();
  const otherBranch = '00000000-0000-4000-8000-000000000099';
  moved.branches.push({ id: otherBranch, legacyId: 'other-branch', code: 'OTHER' });
  moved.doctors[0].branchId = otherBranch;
  assert.equal(mapCatalogRecord(doctor, fixtures, moved).reason, 'TARGET_RELATIONSHIP_CONFLICT');
});

test('normalized catalog fields are preserved in target rows and every source field has an explicit ledger entry', () => {
  const mappedBranch = mapCatalogRecord(branch, fixtures, snapshot());
  assert.equal(mappedBranch.coverage.blocked, 0);
  assert.equal(mappedBranch.rows.branch.addressLine1, branch.data.address.line1);
  assert.equal(mappedBranch.rows.branch.city, branch.data.address.city);
  assert.equal(mappedBranch.rows.branch.postalCode, branch.data.address.postalCode);
  const mappedDepartment = mapCatalogRecord(department, fixtures, snapshot());
  assert.equal(mappedDepartment.coverage.blocked, 0);
  assert.equal(mappedDepartment.rows.department.description, department.data.description);
  assert.equal(mappedDepartment.coverage.fields.length, Object.keys(department.data).length);
  assert.equal(mappedDepartment.coverage.fields.some(field => field.source === 'name' && field.target === 'Department.name' && field.status === 'mapped'), true);
  assert.doesNotMatch(JSON.stringify(mappedDepartment.coverage), /Synthetic description|Synthetic Department|fixture-branch/);
  const mappedDoctor = mapCatalogRecord(doctor, fixtures, snapshot());
  assert.equal(mappedDoctor.rows.doctorDepartments[0].sortOrder, 0);
});

test('source provenance is retained while nanosecond precision and legacy schedules remain explicit blockers', () => {
  const precise = { ...doctor, data: { ...doctor.data, updatedAt: { seconds: 1792348200, nanoseconds: 123456789 }, updatedBy: 'fixture-author', weeklySchedule: [{ weekday: 1, startTime: '08:00', endTime: '10:00', slotMinutes: 20 }] } };
  const records = fixtures.map(record => record === doctor ? precise : record);
  const result = mapCatalogRecord(precise, records, snapshot());
  const blockers = result.coverage.fields.filter(field => field.status === 'blocked').map(field => field.reason);
  for (const reason of ['TARGET_TIMESTAMP_PRECISION_LOSS', 'LEGACY_SCHEDULE_RECONCILIATION_REQUIRED']) assert.ok(blockers.includes(reason));
  assert.equal(result.rows.doctor.legacyUpdatedBy, 'fixture-author');
  assert.deepEqual(result.source, precise);
  assert.equal(result.readyForApply, false);
});

test('doctor membership order and explicitly empty address fields survive normalized mapping', () => {
  const extraDepartment = { ...department, path: 'departments/second-department', data: { ...department.data, code: 'SECOND' } };
  const orderedDoctor = { ...doctor, data: { ...doctor.data, departmentIds: ['second-department', 'fixture-department'] } };
  const richBranch = { ...branch, data: { ...branch.data, address: { ...branch.data.address, line2: '' }, updatedBy: 'fixture-author', createdAt: '2026-10-18T00:00:00Z' } };
  const records = fixtures.map(record => record === doctor ? orderedDoctor : record === branch ? richBranch : record).concat(extraDepartment);
  const targets = snapshot();
  const extraId = '00000000-0000-4000-8000-000000000099';
  targets.departments.push({ id: extraId, legacyId: 'second-department', code: 'SECOND', branchId });
  const result = mapCatalogRecord(orderedDoctor, records, targets);
  assert.deepEqual(result.rows.doctorDepartments, [{ doctorId, departmentId: extraId, sortOrder: 0 }, { doctorId, departmentId, sortOrder: 1 }]);
  const mappedBranch = mapCatalogRecord(richBranch, records, targets);
  assert.equal(mappedBranch.rows.branch.addressLine2, '');
  assert.equal(mappedBranch.rows.branch.legacyUpdatedBy, 'fixture-author');
  assert.equal(mappedBranch.rows.branch.createdAt, '2026-10-18T00:00:00Z');
  assert.equal(mappedBranch.coverage.blocked, 0);
});

test('dry-run reports count reused IDs and mapping blockers without source or target metadata', () => {
  const result = rehearse(fixtures, { targetSnapshot: snapshot() });
  assert.equal(result.identityDecisions.reused, 3);
  assert.equal(result.identityDecisions.newCandidates, 0);
  assert.equal(result.unmappedFields, 0);
  assert.deepEqual(result.mappingBlockers, {});
  assert.equal(result.writes, 0);
  assert.equal(result.readyForApply, 0);
  assert.doesNotMatch(JSON.stringify(result), /fixture-branch|FIXTURE|00000000|Synthetic/);
});
