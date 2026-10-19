const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixtures, targetSnapshot, patientTargetSnapshot, serviceTargetSnapshot, appointmentTargetSnapshot } = require('../migration/fixtures.cjs');
const { mapRegistryRecord, rehearse, legacyUuid } = require('../migration/rehearsal.cjs');
const { prepareMigrationTimestamps } = require('../migration/instant-preservation.cjs');
const counter = fixtures.find(row => row.path === 'counters/patientUhid');
const request = fixtures.find(row => row.path.startsWith('bookingRequests/'));
const options = { targetSnapshot, patientTargetSnapshot, serviceTargetSnapshot, appointmentTargetSnapshot, registryTargetSnapshot: { complete: true, counters: [], requests: [] } };
const replace = record => fixtures.filter(row => row.path !== record.path).concat(record);

test('counter evidence preserves exact value/maxima without allocating or repairing UHIDs', () => {
  const result = mapRegistryRecord(counter, fixtures, options);
  assert.equal(result.status, 'mapped'); assert.equal(result.readyForApply, false);
  assert.equal(result.rows.legacyUhidCounter.sourceValue, '999999');
  assert.equal(result.rows.legacyUhidCounter.observedSourceMax, '999999');
  assert.equal(result.rows.legacyUhidCounter.observedTargetMax, '999999');
  assert.deepEqual(Object.keys(result.rows), ['legacyUhidCounter']);
  assert.ok(result.blockers.includes('UHID_CENSUS_COMPLETENESS_PENDING'));
  assert.ok(result.blockers.includes('UHID_ALLOCATOR_CUTOVER_PENDING'));
  assert.deepEqual(result.source, counter);
});

test('behind counters stay unchanged and target/source floors use BigInt without unsafe coercion', () => {
  const row = { ...counter, data: { ...counter.data, value: 0 } };
  const opts = structuredClone(options); opts.patientTargetSnapshot.patients[0].uhid = 'SC-9007199254740993';
  const result = mapRegistryRecord(row, replace(row), opts);
  assert.equal(result.rows.legacyUhidCounter.sourceValue, '0');
  assert.equal(result.rows.legacyUhidCounter.observedTargetMax, '9007199254740993');
  assert.ok(result.blockers.includes('UHID_COUNTER_BEHIND_SOURCE'));
  assert.ok(result.blockers.includes('UHID_COUNTER_BEHIND_TARGET'));
  const max = { ...counter, data: { ...counter.data, value: Number.MAX_SAFE_INTEGER } };
  assert.ok(mapRegistryRecord(max, replace(max), options).blockers.includes('UHID_SEQUENCE_EXHAUSTED'));
});

test('invalid/duplicate UHIDs, unsafe counters and partial target census fail closed', () => {
  for (const value of [-1, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1]) {
    const row = { ...counter, data: { ...counter.data, value } };
    assert.equal(mapRegistryRecord(row, replace(row), options).status, 'rejected');
  }
  const patient = fixtures.find(row => row.path === 'patients/fixture-account');
  assert.equal(mapRegistryRecord(counter, [...fixtures, { ...patient, path: 'patients/other' }], options).reason, 'DUPLICATE_UHID');
  for (const uhid of ['SC-000000', 'SC-0000001', 'SC-X', undefined]) {
    const bad = { ...patient, data: { ...patient.data, uhid } };
    assert.equal(mapRegistryRecord(counter, replace(bad), options).status, 'rejected');
  }
  assert.equal(mapRegistryRecord(counter, fixtures, { ...options, patientTargetSnapshot: { complete: false, patients: [] } }).status, 'rejected');
  assert.ok(mapRegistryRecord(counter, fixtures).blockers.includes('UHID_TARGET_CENSUS_PENDING'));
});

test('booking receipts preserve original key/reference/status without becoming replay permissions', () => {
  const result = mapRegistryRecord(request, fixtures, options);
  assert.equal(result.status, 'mapped');
  assert.equal(result.rows.legacyBookingRequest.appointmentId, appointmentTargetSnapshot.appointments[0].id);
  assert.equal(result.rows.legacyBookingRequest.legacyRequestKey, request.path.split('/')[1]);
  assert.equal(result.rows.legacyBookingRequest.status, request.data.status);
  assert.equal(result.rows.operationReceipt, undefined);
  assert.ok(result.blockers.includes('REQUEST_SCOPE_UNVERIFIED'));
  assert.ok(result.blockers.includes('REQUEST_REPLAY_DISABLED'));
  const records = structuredClone(fixtures);
  records.find(row => row.path === 'appointments/fixture-appointment').data.status = 'completed';
  const stale = mapRegistryRecord(request, records, options);
  assert.equal(stale.rows.legacyBookingRequest.status, 'scheduled');
  assert.ok(stale.blockers.includes('REQUEST_STATUS_SNAPSHOT_REVIEW'));
});

test('missing appointments, mismatched references and target reparenting never silently apply', () => {
  assert.equal(mapRegistryRecord(request, fixtures.filter(row => row.path !== 'appointments/fixture-appointment'), options).reason, 'MISSING_REFERENCE');
  const wrong = { ...request, data: { ...request.data, reference: 'OTHER' } };
  assert.equal(mapRegistryRecord(wrong, replace(wrong), options).reason, 'REQUEST_REFERENCE_CONFLICT');
  const opts = structuredClone(options);
  opts.registryTargetSnapshot.requests = [{ id: '00000000-0000-4000-8000-000000000096', legacyId: request.path, appointmentId: '00000000-0000-4000-8000-000000000099' }];
  assert.equal(mapRegistryRecord(request, fixtures, opts).reason, 'TARGET_RELATIONSHIP_CONFLICT');
  assert.equal(mapRegistryRecord(request, [...fixtures, request], options).reason, 'DUPLICATE_SOURCE');
});

test('target metadata reuses explicit legacy identity and rejects partial/duplicate/colliding mappings', () => {
  const row = { id: '00000000-0000-4000-8000-000000000095', legacyId: counter.path };
  const opts = structuredClone(options); opts.registryTargetSnapshot.counters = [row];
  assert.equal(mapRegistryRecord(counter, fixtures, opts).rows.legacyUhidCounter.id, row.id);
  for (const patch of [{ complete: false }, { extra: true }, { requests: undefined }, { counters: [row, row] }, { counters: Array(10001).fill(row) }, { counters: [{ ...row, legacyId: request.path }] }]) {
    assert.equal(mapRegistryRecord(counter, fixtures, { ...options, registryTargetSnapshot: { ...options.registryTargetSnapshot, ...patch } }).status, 'rejected');
  }
  opts.registryTargetSnapshot.counters = [{ ...row, id: legacyUuid('counter', counter.path), legacyId: null }];
  assert.equal(mapRegistryRecord(counter, fixtures, opts).reason, 'TARGET_ID_CONFLICT');
});

test('guest booking receipts grant no patient links and retain exact timestamp/import gates', () => {
  const records = structuredClone(fixtures); const opts = structuredClone(options);
  Object.assign(records.find(row => row.path === 'appointments/fixture-appointment').data, { patientId: null, source: 'web', createdBy: { uid: null, role: 'public' } });
  opts.appointmentTargetSnapshot.appointments[0].patientId = null;
  const row = records.find(item => item.path === request.path); row.data.createdAt = { seconds: 1792368000, nanoseconds: 123456789 };
  const result = mapRegistryRecord(row, records, opts);
  assert.equal(result.status, 'mapped'); assert.equal(result.rows.patientLinks, undefined);
  const prepared = prepareMigrationTimestamps(result);
  assert.equal(prepared.status, 'prepared'); assert.equal(prepared.readyForApply, false);
  assert.ok(prepared.blockers.includes('REQUEST_REPLAY_DISABLED'));
  assert.ok(prepared.rows.legacySourceInstants[0].exactValue.endsWith('123456789Z'));
});

test('registry reports stay count-only, deterministic and never imply allocation or replay readiness', () => {
  const report = rehearse(fixtures, options);
  assert.equal(report.registryAssessment.candidates, 2); assert.equal(report.registryAssessment.rejected, 0);
  assert.equal(report.writes, 0); assert.equal(report.readyForApply, 0); assert.equal(report.mapped, 3);
  assert.deepEqual(report.registryAssessment, rehearse([...fixtures].reverse(), { ...options, pageSize: 1 }).registryAssessment);
  assert.doesNotMatch(JSON.stringify(report), /fixture|Synthetic|rows|999999|sourceValue|legacyRequestKey/);
});
