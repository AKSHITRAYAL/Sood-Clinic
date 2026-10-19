const { test } = require('node:test');
const assert = require('node:assert/strict');
const { encodeInstant, restoreInstant, prepareMigrationTimestamps } = require('../migration/instant-preservation.cjs');
const { fixtures, targetSnapshot, patientTargetSnapshot } = require('../migration/fixtures.cjs');
const { mapCatalogRecord, mapPatientRecord, mapAppointmentRecord, mapBookingConfig, mapScheduleRecord, timestampNanos, rehearse } = require('../migration/rehearsal.cjs');

test('codec preserves every nanosecond while flooring only the native SQL value', () => {
  for (const value of ['2026-10-19T00:00:00.123456789Z', '2026-10-19T00:00:00Z', '1969-12-31T23:59:59.999999999Z', { seconds: -62135596800, nanoseconds: 1 }, { seconds: 253402300799, nanoseconds: 999999999 }]) {
    const encoded = encodeInstant(value);
    assert.equal(restoreInstant(encoded), timestampNanos(value));
    assert.match(encoded.sqlValue, /\.\d{6}Z$/);
    assert.match(encoded.exactValue, /\.\d{9}Z$/);
    assert.ok(timestampNanos(encoded.sqlValue) <= timestampNanos(value));
    assert.ok(timestampNanos(value) - timestampNanos(encoded.sqlValue) < 1000n);
  }
  assert.equal(encodeInstant('1969-12-31T23:59:59.999999999Z').sqlValue, '1969-12-31T23:59:59.999999Z');
});

test('invalid or mismatched native/exact values cannot be restored or silently repaired', () => {
  for (const value of ['2026-02-31T00:00:00Z', '0000-01-01T00:00:00Z', 'tomorrow', { seconds: 1, nanoseconds: 1e9 }, { seconds: 1, nanoseconds: 1, extra: 'private' }]) assert.throws(() => encodeInstant(value), /INVALID_TIMESTAMP/);
  const encoded = encodeInstant('2026-10-19T00:00:00.123456789Z');
  assert.throws(() => restoreInstant({ ...encoded, sqlValue: '2026-10-19T00:00:00.123457Z' }), /INSTANT_RECONCILIATION_FAILED/);
  assert.throws(() => restoreInstant({ ...encoded, sqlValue: new Date(encoded.sqlValue) }), /INSTANT_RECONCILIATION_FAILED/);
  assert.throws(() => restoreInstant({ ...encoded, exactValue: '2026-10-19T00:00:00.123456Z' }), /INSTANT_RECONCILIATION_FAILED/);
  const symbol = { seconds: 1, nanoseconds: 1, [Symbol('unexpected')]: true };
  assert.throws(() => encodeInstant(symbol), /INVALID_TIMESTAMP/);
  const getter = { get seconds() { throw new Error('must not execute'); }, nanoseconds: 1 };
  assert.throws(() => encodeInstant(getter), /INVALID_TIMESTAMP/);
});

test('all supported mapped timestamp rows get exact private evidence without mutating original candidates', () => {
  for (const category of ['branches', 'departments', 'doctors', 'patients', 'appointments', 'appointment_events', 'public_config', 'schedules', 'exceptions']) {
    const path = category === 'public_config' ? 'clinic/publicConfig' : null;
    const source = structuredClone(fixtures.find(row => path ? row.path === path : ({ branches: /^branches\//, departments: /^departments\//, doctors: /^doctors\//, patients: /^patients\/[^/]+$/, appointments: /^appointments\/[^/]+$/, appointment_events: /^appointments\/[^/]+\/events\//, schedules: /^doctorSchedules\//, exceptions: /^scheduleExceptions\// })[category].test(row.path)));
    source.data.updatedAt = { seconds: 1792368000, nanoseconds: 123456789 };
    const records = fixtures.filter(row => row.path !== source.path).concat(source);
    const mapped = ['branches', 'departments', 'doctors'].includes(category) ? mapCatalogRecord(source, records, targetSnapshot) : category === 'patients' ? mapPatientRecord(source, records, patientTargetSnapshot) : category === 'public_config' ? mapBookingConfig(source, records) : ['schedules', 'exceptions'].includes(category) ? mapScheduleRecord(source, records, { targetSnapshot }) : mapAppointmentRecord(source, records, { targetSnapshot, patientTargetSnapshot });
    assert.equal(mapped.status, 'mapped');
    const before = structuredClone(mapped);
    const prepared = prepareMigrationTimestamps(mapped);
    assert.equal(prepared.status, 'prepared');
    assert.equal(prepared.readyForApply, false);
    assert.ok(prepared.rows.legacySourceInstants.length > 0);
    assert.ok(prepared.rows.legacySourceInstants.some(row => row.exactValue.endsWith('123456789Z')));
    assert.ok(prepared.blockers.includes('EXACT_TIMESTAMP_TRANSACTION_PENDING'));
    assert.deepEqual(mapped, before);
    for (const row of prepared.rows.legacySourceInstants) assert.equal(restoreInstant(row), timestampNanos(row.exactValue));
  }
});

test('clinical text that resembles a timestamp stays text; nullable source timestamps stay null', () => {
  const source = structuredClone(fixtures.find(row => row.path === 'patients/fixture-account'));
  source.data.healthNotes = '2026-10-19T00:00:00.123456789Z';
  const result = prepareMigrationTimestamps(mapPatientRecord(source, [source], patientTargetSnapshot));
  assert.equal(result.rows.patientReportedProfile.healthNotes, source.data.healthNotes);
  assert.equal(result.rows.patient.createdAt, null);
  assert.ok(result.blockers.includes('SOURCE_CREATED_AT_MISSING'));
  assert.ok(!result.rows.legacySourceInstants.some(row => row.field === 'healthNotes'));
});

test('precision-loss blockers survive preparation and collapsed native intervals require review', () => {
  const source = structuredClone(fixtures.find(row => row.path === 'appointments/fixture-appointment'));
  Object.assign(source.data, { startsAt: '2026-10-20T02:30:00.000000001Z', endsAt: '2026-10-20T02:30:00.000000002Z' });
  const records = fixtures.filter(row => row.path !== source.path).concat(source);
  const mapped = mapAppointmentRecord(source, records, { targetSnapshot, patientTargetSnapshot });
  const result = prepareMigrationTimestamps(mapped);
  assert.equal(result.rows.appointment.startsAt, result.rows.appointment.endsAt);
  assert.ok(result.blockers.includes('TARGET_TIMESTAMP_PRECISION_LOSS'));
  assert.ok(result.blockers.includes('NATIVE_INTERVAL_PRECISION_REVIEW'));
  assert.equal(result.readyForApply, false);
});

test('unmapped sources, unsupported row types and missing target identities fail closed without row values', () => {
  assert.equal(prepareMigrationTimestamps({ status: 'deferred' }).reason, 'NOT_A_MAPPED_CANDIDATE');
  const source = fixtures.find(row => row.path === 'branches/fixture-branch');
  for (const alter of [row => { row.rows.unknown = { private: 'DO_NOT_LEAK' }; }, row => { delete row.rows.branch.id; }, row => { row.rows.branch.updatedAt = 'private-invalid-time'; }]) {
    const mapped = mapCatalogRecord(source, fixtures, targetSnapshot); alter(mapped);
    const result = prepareMigrationTimestamps(mapped);
    assert.equal(result.status, 'rejected');
    assert.doesNotMatch(JSON.stringify(result), /DO_NOT_LEAK|private|fixture|rows/);
  }
});

test('timestamp preparation is bounded, deterministic and reported as counts with zero writes', () => {
  const branch = fixtures.find(row => row.path === 'branches/fixture-branch');
  const oversized = mapCatalogRecord(branch, fixtures);
  oversized.rows.doctorDepartments = Array(2001).fill({ doctorId: 'synthetic', departmentId: 'synthetic' });
  assert.equal(prepareMigrationTimestamps(oversized).status, 'rejected');
  const options = { targetSnapshot, patientTargetSnapshot };
  const report = rehearse(fixtures, options);
  assert.ok(report.timestampPreparation.prepared > 0);
  assert.ok(report.timestampPreparation.instants > 0);
  assert.deepEqual(report.timestampPreparation, rehearse([...fixtures].reverse(), { ...options, pageSize: 1 }).timestampPreparation);
  assert.equal(report.writes, 0);
  assert.doesNotMatch(JSON.stringify(report), /fixture|Synthetic|exactValue|entityId|rows/);
});
