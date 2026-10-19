const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixtures, targetSnapshot, patientTargetSnapshot } = require('../migration/fixtures.cjs');
const { mapAppointmentRecord, legacyUuid, rehearse } = require('../migration/rehearsal.cjs');
const appointment = fixtures.find(row => row.path === 'appointments/fixture-appointment');
const event = fixtures.find(row => row.path === 'appointments/fixture-appointment/events/fixture-event');
const serviceTargetSnapshot = { complete: true, services: [{ id: '00000000-0000-4000-8000-000000000055', legacyId: 'consultation', code: 'consultation' }] };
const appointmentTargetSnapshot = { complete: true, appointments: [{ id: '00000000-0000-4000-8000-000000000066', legacyId: 'fixture-appointment', reference: 'FIXTURE-APPOINTMENT', patientId: patientTargetSnapshot.patients[0].id, doctorId: targetSnapshot.doctors[0].id, branchId: targetSnapshot.branches[0].id, serviceId: serviceTargetSnapshot.services[0].id }], events: [{ id: '00000000-0000-4000-8000-000000000077', legacyId: event.path, appointmentId: '00000000-0000-4000-8000-000000000066' }] };
const options = () => structuredClone({ targetSnapshot, patientTargetSnapshot, serviceTargetSnapshot, appointmentTargetSnapshot });

test('appointment/event target legacy mappings are reused throughout references without approving writes', () => {
  const mapped = mapAppointmentRecord(appointment, fixtures, options());
  assert.equal(mapped.status, 'mapped');
  assert.equal(mapped.rows.appointment.id, appointmentTargetSnapshot.appointments[0].id);
  assert.equal(mapped.identityDecision, 'reuse_existing');
  assert.equal(mapped.targetSnapshotChecked, true);
  assert.ok(!mapped.blockers.includes('APPOINTMENT_TARGET_IDENTITY_PENDING'));
  assert.equal(mapped.readyForApply, false);
  const history = mapAppointmentRecord(event, fixtures, options());
  assert.equal(history.rows.appointmentEvent.id, appointmentTargetSnapshot.events[0].id);
  assert.equal(history.rows.appointmentEvent.appointmentId, mapped.rows.appointment.id);
  assert.equal(history.rows.appointmentEvent.legacyId, event.path);
  assert.ok(history.blockers.includes('EVENT_ACTION_PROVENANCE_PENDING'));
});

test('only verified empty snapshots permit new candidate IDs and qualified event identity', () => {
  const opts = options(); opts.appointmentTargetSnapshot = { complete: true, appointments: [], events: [] };
  const mapped = mapAppointmentRecord(event, fixtures, opts);
  assert.equal(mapped.rows.appointmentEvent.id, legacyUuid('appointment_event', event.path));
  assert.equal(mapped.rows.appointmentEvent.appointmentId, legacyUuid('appointment', 'fixture-appointment'));
  assert.equal(mapped.identityDecision, 'new_candidate');
  assert.equal(mapped.targetSnapshotChecked, true);
  delete opts.appointmentTargetSnapshot;
  assert.ok(mapAppointmentRecord(event, fixtures, opts).blockers.includes('APPOINTMENT_TARGET_IDENTITY_PENDING'));
});

test('reference equality alone cannot adopt unrelated or unlinked target appointment rows', () => {
  for (const legacyId of [null, 'other-legacy-id']) {
    const opts = options(); opts.appointmentTargetSnapshot.appointments[0].legacyId = legacyId;
    assert.equal(mapAppointmentRecord(appointment, fixtures, opts).reason, 'TARGET_UNIQUE_CONFLICT');
  }
});

test('existing target relationships and booking reference cannot be silently rewritten', () => {
  for (const field of ['patientId', 'doctorId', 'branchId', 'serviceId']) {
    const opts = options(); opts.appointmentTargetSnapshot.appointments[0][field] = '00000000-0000-4000-8000-000000000099';
    assert.equal(mapAppointmentRecord(appointment, fixtures, opts).reason, 'TARGET_RELATIONSHIP_CONFLICT');
  }
  const opts = options(); opts.appointmentTargetSnapshot.appointments[0].reference = 'OTHER';
  assert.equal(mapAppointmentRecord(appointment, fixtures, opts).reason, 'TARGET_UNIQUE_CONFLICT');
});

test('partial, duplicate, unbounded or dangling target metadata is rejected without returning values', () => {
  for (const patch of [{ complete: false }, { extra: true }, { events: undefined }, { appointments: Array(10001).fill(appointmentTargetSnapshot.appointments[0]) }, { events: [{ ...appointmentTargetSnapshot.events[0], appointmentId: '00000000-0000-4000-8000-000000000099' }] }, { events: [...appointmentTargetSnapshot.events, ...appointmentTargetSnapshot.events] }]) {
    const opts = options(); Object.assign(opts.appointmentTargetSnapshot, patch);
    const result = mapAppointmentRecord(appointment, fixtures, opts);
    assert.equal(result.status, 'rejected');
    assert.equal(result.reason, 'INVALID_TARGET_SNAPSHOT');
    assert.doesNotMatch(JSON.stringify(result), /fixture|FIXTURE|00000000/);
  }
});

test('new deterministic ID collisions and reassigned event parents are rejected', () => {
  const opts = options(); opts.appointmentTargetSnapshot.events = [];
  opts.appointmentTargetSnapshot.appointments[0].id = legacyUuid('appointment', 'fixture-appointment');
  opts.appointmentTargetSnapshot.appointments[0].legacyId = 'another';
  opts.appointmentTargetSnapshot.appointments[0].reference = 'ANOTHER';
  assert.equal(mapAppointmentRecord(appointment, fixtures, opts).reason, 'TARGET_ID_CONFLICT');
  const other = options();
  const second = { ...other.appointmentTargetSnapshot.appointments[0], id: '00000000-0000-4000-8000-000000000088', legacyId: 'second', reference: 'SECOND' };
  other.appointmentTargetSnapshot.appointments.push(second);
  other.appointmentTargetSnapshot.events[0].appointmentId = second.id;
  assert.equal(mapAppointmentRecord(event, fixtures, other).reason, 'TARGET_RELATIONSHIP_CONFLICT');
});

test('reports include identity checks with no source/target IDs or row contents', () => {
  const result = rehearse(fixtures, options());
  assert.equal(result.appointmentAssessment.candidates, 2);
  assert.equal(result.appointmentAssessment.blockers.APPOINTMENT_TARGET_IDENTITY_PENDING, undefined);
  assert.equal(result.writes, 0);
  assert.doesNotMatch(JSON.stringify(result), /fixture|FIXTURE|00000000|rows/);
});
