const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixtures } = require('../migration/fixtures.cjs');
const { assessSchedule, rehearse } = require('../migration/rehearsal.cjs');
const weekly = fixtures.find(row => row.path === 'doctorSchedules/fixture-doctor');
const exception = fixtures.find(row => row.path === 'scheduleExceptions/fixture-exception');
const doctor = fixtures.find(row => row.path === 'doctors/fixture-doctor');
const replace = (...rows) => fixtures.filter(row => !rows.some(next => next.path === row.path)).concat(rows);

test('weekly assessment preserves IST minute windows and never claims a SQL mapping or write', () => {
  const result = assessSchedule(weekly, fixtures);
  assert.equal(result.status, 'deferred');
  assert.equal(result.authority, 'doctor_schedule');
  assert.deepEqual(result.windows, [{ weekday: 1, startMinute: 480, endMinute: 600 }]);
  assert.deepEqual(result.source, weekly);
  assert.equal(result.readyForApply, false);
  assert.ok(result.blockers.includes('SCHEDULE_TARGET_MAPPING_PENDING'));
});

test('invalid weekly hours, weekday coercion and overlapping windows fail closed', () => {
  for (const sessions of [
    [{ weekday: '1', start: '08:00', end: '10:00' }],
    [{ weekday: 7, start: '08:00', end: '10:00' }],
    [{ weekday: 1, start: '23:00', end: '01:00' }],
    [{ weekday: 1, start: '08:00', end: '24:00' }],
    [{ weekday: 1, start: '08:00', end: '10:00' }, { weekday: 1, start: '09:00', end: '11:00' }],
    Array(15).fill({ weekday: 1, start: '08:00', end: '10:00' }),
  ]) {
    const row = { ...weekly, data: { ...weekly.data, sessions } };
    assert.equal(assessSchedule(row, replace(row)).reason, 'INVALID_SCHEDULE_WINDOWS');
  }
  const touching = { ...weekly, data: { ...weekly.data, sessions: [{ weekday: 1, start: '08:00', end: '10:00' }, { weekday: 1, start: '10:00', end: '11:00' }] } };
  assert.equal(assessSchedule(touching, replace(touching)).status, 'deferred');
});

test('explicit empty modern schedule wins over fallback, but conflicting legacy hours require review', () => {
  const empty = { ...weekly, data: { ...weekly.data, sessions: [] } };
  const embedded = { ...doctor, data: { ...doctor.data, weeklySchedule: [{ weekday: 1, startTime: '08:00', endTime: '10:00', slotMinutes: 20 }] } };
  const result = assessSchedule(empty, replace(empty, embedded));
  assert.equal(result.authority, 'doctor_schedule');
  assert.deepEqual(result.windows, []);
  assert.ok(result.blockers.includes('SCHEDULE_SOURCE_CONFLICT'));
  const fallback = assessSchedule(embedded, replace(embedded).filter(row => row !== weekly));
  assert.equal(fallback.authority, 'embedded_doctor');
  assert.equal(fallback.windows[0].startMinute, 480);
  assert.ok(fallback.blockers.includes('LEGACY_SLOT_DURATION_REVIEW'));
});

test('old clinic schedule never silently becomes runtime authority', () => {
  const old = fixtures.find(row => row.path.startsWith('clinicSchedules/'));
  const result = assessSchedule(old, fixtures);
  assert.equal(result.authority, 'doctor_schedule');
  assert.ok(result.blockers.includes('LEGACY_CLINIC_SCHEDULE_REVIEW'));
  assert.ok(result.blockers.includes('SCHEDULE_SOURCE_CONFLICT'));
});

test('exception dates, closed/extra/replace semantics and combined extra overlap are validated', () => {
  assert.equal(assessSchedule(exception, fixtures).status, 'deferred');
  for (const data of [
    { dateKey: '2026-02-31' }, { type: 'unknown' },
    { type: 'closed', sessions: [{ start: '08:00', end: '09:00' }] },
    { type: 'replace', sessions: [] },
    { type: 'extra', dateKey: '2026-10-19', sessions: [{ start: '09:00', end: '11:00' }] },
  ]) {
    const row = { ...exception, data: { ...exception.data, ...data } };
    assert.equal(assessSchedule(row, replace(row)).status, 'rejected');
  }
  const row = { ...exception, data: { ...exception.data, type: 'replace', sessions: [{ start: '09:00', end: '11:00' }] } };
  assert.deepEqual(assessSchedule(row, replace(row)).windows, [{ startMinute: 540, endMinute: 660 }]);
});

test('duplicate source/date and missing doctor references are rejected without leaking row values', () => {
  assert.equal(assessSchedule(weekly, [...fixtures, weekly]).reason, 'DUPLICATE_SOURCE');
  assert.equal(assessSchedule(weekly, fixtures.filter(row => row !== doctor)).reason, 'MISSING_REFERENCE');
  const wrongPath = { ...weekly, path: 'doctorSchedules/other' };
  assert.equal(assessSchedule(wrongPath, replace(wrongPath)).reason, 'SCHEDULE_SOURCE_ID_MISMATCH');
  const duplicate = { ...exception, path: 'scheduleExceptions/other' };
  assert.equal(assessSchedule(exception, [...fixtures, duplicate]).reason, 'DUPLICATE_EXCEPTION_DATE');
  const unknown = { ...weekly, data: { ...weekly.data, secret: 'PRIVATE' } };
  assert.doesNotMatch(JSON.stringify(assessSchedule(unknown, replace(unknown))), /PRIVATE|secret|fixture/);
});

test('provenance and sub-microsecond timestamps remain blocked, never published or rounded', () => {
  const row = { ...exception, data: { ...exception.data, updatedAt: '2026-10-19T00:00:00.123456789Z', reason: 'PRIVATE_REASON' } };
  const result = assessSchedule(row, replace(row));
  assert.ok(result.blockers.includes('TARGET_TIMESTAMP_PRECISION_LOSS'));
  assert.ok(result.blockers.includes('SCHEDULE_PRIVATE_METADATA_PENDING'));
  assert.equal(result.source.data.reason, 'PRIVATE_REASON');
  const invalid = { ...row, data: { ...row.data, updatedAt: 'yesterday' } };
  assert.equal(assessSchedule(invalid, replace(invalid)).reason, 'INVALID_SCHEDULE_METADATA');
});

test('count-only rehearsal includes schedule blockers, stable across input order and pages', () => {
  const result = rehearse(fixtures, { pageSize: 1 });
  assert.deepEqual(result.scheduleAssessment, rehearse([...fixtures].reverse(), { pageSize: 7 }).scheduleAssessment);
  assert.equal(result.scheduleAssessment.assessed, 3);
  assert.equal(result.scheduleAssessment.rejected, 0);
  assert.ok(result.scheduleAssessment.blockers.LEGACY_CLINIC_SCHEDULE_REVIEW);
  assert.equal(result.writes, 0);
  assert.doesNotMatch(JSON.stringify(result), /fixture|Synthetic|windows|doctorId/);
});
