const { test } = require('node:test');
const assert = require('node:assert/strict');
const { releaseSourceBlockers, checkLocalReleaseSources } = require('../scripts/release-check.cjs');

const NAMED = 'type Appointment @table {\n patient: Patient!\n}';
const GUEST = 'type Appointment @table {\n patient: Patient\n}';
const plan = (overrides = {}) => ({
  deployableConnectors: ['clinic', 'admin'],
  excludedConnectors: { rehearsal: 'LOCAL_SYNTHETIC_REHEARSAL' },
  guestRelation: {
    status: 'approved', guestsAllowed: true, appointmentPatientNullable: true,
    guestDataInPrivateDetails: true, publicSqlAppointmentWriterReleased: false,
  },
  ...overrides,
});
const tree = (overrides = {}) => ({
  schema: NAMED, connectors: { admin: '', clinic: '' }, dirs: ['admin', 'clinic'], plan: plan(), ...overrides,
});

test('release source guard refuses synthetic operations, rehearsal SDK exports and an unreviewed guest relation', () => {
  assert.deepEqual(releaseSourceBlockers({ schema: NAMED }), ['RELEASE_PLAN_UNREADABLE']);
  assert.deepEqual(releaseSourceBlockers(tree()), []);
  assert.deepEqual(releaseSourceBlockers(tree({ dirs: ['admin', 'clinic', 'rehearsal'] })), []);

  // A nullable FK is only accepted when the reviewed plan states the whole guest policy.
  assert.deepEqual(releaseSourceBlockers(tree({ schema: GUEST })), []);
  assert.deepEqual(releaseSourceBlockers(tree({ schema: GUEST, plan: plan({ guestRelation: {} }) })), ['GUEST_RELATION_RELEASE_REVIEW_REQUIRED']);
  assert.deepEqual(
    releaseSourceBlockers(tree({ schema: GUEST, plan: plan({ guestRelation: { status: 'approved', guestsAllowed: true } }) })),
    ['GUEST_RELATION_POLICY_INCOMPLETE'],
  );
  assert.deepEqual(
    releaseSourceBlockers(tree({ schema: GUEST, plan: plan({ guestRelation: { ...plan().guestRelation, publicSqlAppointmentWriterReleased: true } }) })),
    ['GUEST_RELATION_POLICY_INCOMPLETE'],
  );

  // Rehearsal operations stay fatal in a released connector but are allowed only in an excluded one.
  assert.deepEqual(releaseSourceBlockers(tree({ connectors: { admin: 'mutation RehearseBranchCompareAndSet', clinic: '' } })), ['SYNTHETIC_REHEARSAL_OPERATIONS_PRESENT']);
  assert.deepEqual(
    releaseSourceBlockers(tree({ connectors: { admin: '', clinic: '', rehearsal: 'mutation RehearseBranchCompareAndSet' }, dirs: ['admin', 'clinic', 'rehearsal'] })),
    [],
  );
  assert.deepEqual(releaseSourceBlockers(tree({ dirs: ['admin', 'clinic', 'stray'] })), ['UNACCOUNTED_CONNECTOR']);
  assert.deepEqual(
    releaseSourceBlockers(tree({ sdk: 'exports.inspectBranchRehearsal = inspectBranchRehearsal' })),
    ['SYNTHETIC_REHEARSAL_SDK_PRESENT'],
  );
  assert.deepEqual(
    releaseSourceBlockers(tree({ schema: 'not a recognized schema' })),
    ['APPOINTMENT_RELATION_SOURCE_UNRECOGNIZED'],
  );
});

test('the current tree is release-ready in source and keeps the apply decision open', () => {
  const { blockers, plan: record, dirs } = checkLocalReleaseSources();
  assert.deepEqual(blockers, []);
  assert.deepEqual(dirs, ['clinic', 'admin', 'rehearsal']);
  assert.deepEqual(record.deployableConnectors, ['clinic', 'admin']);
  assert.deepEqual(Object.keys(record.excludedConnectors), ['rehearsal']);
  assert.equal(record.guestRelation.status, 'approved');
  assert.equal(record.guestRelation.guestsAllowed, true);
  assert.equal(record.guestRelation.appointmentPatientNullable, true);
  assert.equal(record.guestRelation.guestDataInPrivateDetails, true);
  assert.equal(record.guestRelation.publicSqlAppointmentWriterReleased, false);
  // The source check never approves a production schema apply or deployment.
  assert.equal(record.guestRelation.productionSchemaTransitionReviewed, false);
});
