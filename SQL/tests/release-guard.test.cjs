const { test } = require('node:test');
const assert = require('node:assert/strict');
const { releaseSourceBlockers, checkLocalReleaseSources } = require('../scripts/release-check.cjs');

test('release source guard refuses synthetic operations/SDK exports and unreviewed nullable guest FK', () => {
  assert.deepEqual(releaseSourceBlockers('type Appointment @table {\n patient: Patient!\n}', '', ''), []);
  assert.ok(releaseSourceBlockers('type Appointment @table {\n patient: Patient\n}', 'mutation RehearseBranchCompareAndSet', '').includes('SYNTHETIC_REHEARSAL_OPERATIONS_PRESENT'));
  assert.ok(releaseSourceBlockers('type Appointment @table {\n patient: Patient\n}', '', '').includes('GUEST_RELATION_RELEASE_REVIEW_REQUIRED'));
  assert.ok(releaseSourceBlockers('type Appointment @table {\n patient: Patient!\n}', '', 'exports.inspectBranchRehearsal = inspectBranchRehearsal').includes('SYNTHETIC_REHEARSAL_SDK_PRESENT'));
  assert.ok(releaseSourceBlockers('not a recognized schema', '', '').includes('APPOINTMENT_RELATION_SOURCE_UNRECOGNIZED'));
});

test('current draft deliberately fails release readiness without making cloud calls', () => {
  const blockers = checkLocalReleaseSources();
  assert.ok(blockers.includes('SYNTHETIC_REHEARSAL_OPERATIONS_PRESENT'));
  assert.ok(blockers.includes('SYNTHETIC_REHEARSAL_SDK_PRESENT'));
  assert.ok(blockers.includes('GUEST_RELATION_RELEASE_REVIEW_REQUIRED'));
});
