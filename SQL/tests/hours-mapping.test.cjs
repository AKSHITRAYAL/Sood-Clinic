const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixtures, targetSnapshot } = require('../migration/fixtures.cjs');
const { mapScheduleRecord, legacyUuid, rehearse } = require('../migration/rehearsal.cjs');
const weekly = fixtures.find(row => row.path === 'doctorSchedules/fixture-doctor');
const exception = fixtures.find(row => row.path === 'scheduleExceptions/fixture-exception');
const replace = (...rows) => fixtures.filter(item => !rows.some(row => row.path === item.path)).concat(rows);
const emptyTarget = () => ({ complete: true, states: [], weekly: [], exceptions: [], windows: [] });
const options = snapshot => ({ targetSnapshot, scheduleTargetSnapshot: snapshot });

test('weekly rows preserve source order separately from sorted validation and resolve doctor identities', () => {
  const row = structuredClone(weekly);
  row.data.sessions = [{ weekday: 5, start: '17:00', end: '18:30' }, { weekday: 1, start: '08:00', end: '10:00' }];
  row.data.updatedBy = 'synthetic-operator';
  const result = mapScheduleRecord(row, replace(row), options(emptyTarget()));
  assert.equal(result.status, 'mapped');
  assert.equal(result.readyForApply, false);
  assert.deepEqual(result.rows.doctorSchedules.map(item => [item.weekday, item.startMinute, item.endMinute, item.sourceOrder]), [[5, 1020, 1110, 0], [1, 480, 600, 1]]);
  assert.equal(result.rows.scheduleState.doctorId, targetSnapshot.doctors[0].id);
  assert.equal(result.rows.scheduleState.legacyUpdatedBy, 'synthetic-operator');
  assert.ok(result.blockers.includes('SCHEDULE_SOURCE_CONFLICT'));
  assert.ok(!result.blockers.includes('SCHEDULE_TARGET_MAPPING_PENDING'));
});

test('explicit empty weekly hours retain a state row so future reads cannot fall back to old hours', () => {
  const row = { ...weekly, data: { ...weekly.data, sessions: [] } };
  const result = mapScheduleRecord(row, replace(row), options(emptyTarget()));
  assert.deepEqual(result.rows.doctorSchedules, []);
  assert.equal(result.rows.scheduleState.authority, 'doctor_schedule');
  assert.equal(result.rows.scheduleState.legacySourcePath, row.path);
  assert.equal(result.rows.scheduleState.doctorId, targetSnapshot.doctors[0].id);
});

test('closed, replacement and extra-day windows preserve private notes without public note promotion', () => {
  for (const type of ['closed', 'replace', 'extra']) {
    const row = { ...exception, data: { ...exception.data, type, sessions: type === 'closed' ? [] : [{ start: '17:00', end: '18:00' }], note: '', reason: 'Synthetic private closure reason', createdBy: 'synthetic-author' } };
    const mapped = mapScheduleRecord(row, replace(row), options(emptyTarget()));
    assert.equal(mapped.status, 'mapped');
    assert.equal(mapped.rows.scheduleException.kind, type);
    assert.equal(mapped.rows.scheduleException.legacyNote, '');
    assert.equal(mapped.rows.scheduleException.legacyReason, row.data.reason);
    assert.equal(mapped.rows.scheduleException.publicNote, null);
    assert.equal(mapped.rows.exceptionWindows.length, type === 'closed' ? 0 : 1);
    assert.ok(!mapped.blockers.includes('SCHEDULE_PRIVATE_METADATA_PENDING'));
    assert.doesNotMatch(JSON.stringify(mapped.coverage), /Synthetic|synthetic-author/);
  }
});

test('existing schedule/window legacy identities and exception foreign keys are reused', () => {
  const row = { ...exception, data: { ...exception.data, type: 'replace', sessions: [{ start: '17:00', end: '18:00' }] } };
  const target = emptyTarget();
  target.exceptions = [{ id: '00000000-0000-4000-8000-000000000081', legacyId: 'fixture-exception', doctorId: targetSnapshot.doctors[0].id, date: row.data.dateKey }];
  target.windows = [{ id: '00000000-0000-4000-8000-000000000082', legacyId: `${row.path}/sessions/0`, exceptionId: target.exceptions[0].id }];
  const result = mapScheduleRecord(row, replace(row), options(target));
  assert.equal(result.rows.scheduleException.id, target.exceptions[0].id);
  assert.equal(result.rows.exceptionWindows[0].id, target.windows[0].id);
  assert.equal(result.rows.exceptionWindows[0].exceptionId, target.exceptions[0].id);
  assert.equal(result.targetSnapshotChecked, true);
  const weeklyTarget = emptyTarget();
  weeklyTarget.states = [{ doctorId: targetSnapshot.doctors[0].id, legacySourcePath: weekly.path }];
  weeklyTarget.weekly = [{ id: '00000000-0000-4000-8000-000000000083', legacyId: `${weekly.path}/sessions/0`, doctorId: targetSnapshot.doctors[0].id }];
  assert.equal(mapScheduleRecord(weekly, fixtures, options(weeklyTarget)).rows.doctorSchedules[0].id, weeklyTarget.weekly[0].id);
});

test('partial metadata, duplicate IDs, date adoption and reparenting cannot silently replace target hours', () => {
  const duplicate = { id: '00000000-0000-4000-8000-000000000083', legacyId: `${weekly.path}/sessions/0`, doctorId: targetSnapshot.doctors[0].id };
  for (const patch of [{ complete: false }, { unknown: [] }, { states: undefined }, { weekly: [duplicate, duplicate] }, { weekly: Array(10001).fill(duplicate) }, { windows: [{ id: '00000000-0000-4000-8000-000000000082', legacyId: 'x', exceptionId: '00000000-0000-4000-8000-000000000081' }] }]) {
    const target = Object.assign(emptyTarget(), patch);
    assert.equal(mapScheduleRecord(weekly, fixtures, options(target)).reason, 'INVALID_TARGET_SNAPSHOT');
  }
  const target = emptyTarget();
  target.exceptions = [{ id: '00000000-0000-4000-8000-000000000081', legacyId: null, doctorId: targetSnapshot.doctors[0].id, date: exception.data.dateKey }];
  assert.equal(mapScheduleRecord(exception, fixtures, options(target)).reason, 'TARGET_UNIQUE_CONFLICT');
  target.exceptions[0].legacyId = 'fixture-exception'; target.exceptions[0].doctorId = '00000000-0000-4000-8000-000000000099';
  assert.equal(mapScheduleRecord(exception, fixtures, options(target)).reason, 'TARGET_RELATIONSHIP_CONFLICT');
  const collision = emptyTarget();
  collision.weekly = [{ ...duplicate, id: legacyUuid('schedule_window', `${weekly.path}/sessions/0`), legacyId: 'another-source' }];
  assert.equal(mapScheduleRecord(weekly, fixtures, options(collision)).reason, 'TARGET_ID_CONFLICT');
  const unlinked = emptyTarget(); unlinked.weekly = [{ ...duplicate, legacyId: null }];
  assert.equal(mapScheduleRecord(weekly, fixtures, options(unlinked)).reason, 'TARGET_UNIQUE_CONFLICT');
});

test('malformed sources reject while missing timestamps, unchecked identity and precision stay blocked', () => {
  const row = { ...weekly, data: { ...weekly.data, updatedAt: '2026-10-19T00:00:00.123456789Z' } };
  const result = mapScheduleRecord(row, replace(row), options());
  assert.ok(result.blockers.includes('TARGET_TIMESTAMP_PRECISION_LOSS'));
  assert.ok(result.blockers.includes('SCHEDULE_TARGET_IDENTITY_UNCHECKED'));
  assert.ok(result.coverage.fields.some(field => field.source === 'updatedAt' && field.status === 'blocked'));
  assert.equal(result.rows.doctorSchedules[0].updatedAt, row.data.updatedAt);
  const invalid = { ...exception, data: { ...exception.data, reason: 12 } };
  assert.equal(mapScheduleRecord(invalid, replace(invalid), options()).status, 'rejected');
  const missing = structuredClone(weekly); delete missing.data.updatedAt;
  assert.ok(mapScheduleRecord(missing, replace(missing), options()).blockers.includes('SOURCE_UPDATED_AT_MISSING'));
});

test('legacy clinic and embedded fallback hours remain deferred with complete private source evidence', () => {
  const old = fixtures.find(row => row.path.startsWith('clinicSchedules/'));
  const result = mapScheduleRecord(old, fixtures, options(emptyTarget()));
  assert.equal(result.status, 'deferred');
  assert.equal(result.rows, undefined);
  assert.deepEqual(result.source, old);
  assert.notEqual(legacyUuid('schedule_window', `${weekly.path}/sessions/0`), legacyUuid('exception_window', `${weekly.path}/sessions/0`));
});

test('schedule projection reports contain only counts and keep every apply path disabled', () => {
  const opts = options(emptyTarget());
  const result = rehearse(fixtures, opts);
  assert.equal(result.scheduleProjection.assessed, 3);
  assert.equal(result.scheduleProjection.candidates, 2);
  assert.equal(result.scheduleProjection.deferred, 1);
  assert.equal(result.readyForApply, 0);
  assert.equal(result.writes, 0);
  assert.deepEqual(result.scheduleProjection, rehearse([...fixtures].reverse(), { ...opts, pageSize: 1 }).scheduleProjection);
  assert.doesNotMatch(JSON.stringify(result), /fixture|Synthetic|doctorId|rows/);
});
