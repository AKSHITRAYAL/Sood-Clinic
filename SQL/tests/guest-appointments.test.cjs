const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixtures, targetSnapshot, patientTargetSnapshot, serviceTargetSnapshot, appointmentTargetSnapshot } = require('../migration/fixtures.cjs');
const { mapAppointmentRecord, rehearse } = require('../migration/rehearsal.cjs');
const { prepareMigrationTimestamps } = require('../migration/instant-preservation.cjs');

function guest() {
  const records = structuredClone(fixtures);
  const appointment = records.find(row => row.path === 'appointments/fixture-appointment');
  Object.assign(appointment.data, { patientId: null, source: 'web', createdBy: { uid: null, role: 'public' }, updatedAt: appointment.data.createdAt });
  const event = records.find(row => row.path === `${appointment.path}/events/fixture-event`);
  Object.assign(event.data, { byUid: null, byRole: 'public', meta: { source: 'web' } });
  const options = structuredClone({ targetSnapshot, patientTargetSnapshot, serviceTargetSnapshot, appointmentTargetSnapshot });
  options.appointmentTargetSnapshot.appointments[0].patientId = null;
  return { records, appointment, event, options };
}

test('explicit anonymous source preserves NULL patient and private contact without creating identities or access', () => {
  const { records, appointment, options } = guest();
  const original = structuredClone(appointment);
  const result = mapAppointmentRecord(appointment, records, options);
  assert.equal(result.status, 'mapped');
  assert.equal(result.rows.appointment.patientId, null);
  assert.equal(result.rows.appointment.createdByUid, null);
  assert.equal(result.rows.appointment.id, appointmentTargetSnapshot.appointments[0].id);
  assert.equal(result.rows.appointmentPrivateDetails.snapshotPhone, appointment.data.patientSnapshot.phone);
  assert.deepEqual(Object.keys(result.rows).sort(), ['appointment', 'appointmentPrivateDetails']);
  assert.ok(result.blockers.includes('GUEST_RELATION_RELEASE_PENDING'));
  assert.equal(result.readyForApply, false);
  assert.deepEqual(appointment, original);
  // Even identical source contact details must not select the existing patient.
  assert.equal(result.rows.appointmentPrivateDetails.snapshotEmail, records.find(row => row.path.startsWith('patients/')).data.email);
});

test('guest migration does not depend on a patient registry but still requires real catalogue references', () => {
  const { records, appointment, options } = guest();
  const withoutPatients = records.filter(row => !row.path.startsWith('patients/'));
  assert.equal(mapAppointmentRecord(appointment, withoutPatients, options).status, 'mapped');
  assert.equal(mapAppointmentRecord(appointment, withoutPatients.filter(row => !row.path.startsWith('doctors/')), options).reason, 'MISSING_REFERENCE');
});

test('missing, malformed or contradictory guest evidence cannot disguise an unresolved registered patient', () => {
  for (const patch of [{ patientId: undefined }, { patientId: '' }, { patientId: 'missing' }, { source: 'patient_portal' }, { source: undefined }, { createdBy: undefined }, { createdBy: { uid: 'fixture-account', role: 'public' } }, { createdBy: { uid: null, role: 'patient' } }, { createdBy: { uid: null, role: 'guest' } }]) {
    const { records, appointment, options } = guest();
    Object.assign(appointment.data, patch);
    assert.equal(mapAppointmentRecord(appointment, records, options).status, 'rejected');
  }
});

test('target NULL is explicit and cannot silently link or unlink an existing booking', () => {
  const context = guest();
  context.options.appointmentTargetSnapshot.appointments[0].patientId = patientTargetSnapshot.patients[0].id;
  assert.equal(mapAppointmentRecord(context.appointment, context.records, context.options).reason, 'TARGET_RELATIONSHIP_CONFLICT');
  const registered = fixtures.find(row => row.path === context.appointment.path);
  context.options.appointmentTargetSnapshot.appointments[0].patientId = null;
  assert.equal(mapAppointmentRecord(registered, fixtures, context.options).reason, 'TARGET_RELATIONSHIP_CONFLICT');
  delete context.options.appointmentTargetSnapshot.appointments[0].patientId;
  assert.equal(mapAppointmentRecord(context.appointment, context.records, context.options).status, 'rejected');
});

test('guest events and exact timestamp preparation retain parent gates and private evidence', () => {
  const { records, appointment, event, options } = guest();
  const mapped = mapAppointmentRecord(event, records, options);
  assert.equal(mapped.status, 'mapped');
  assert.equal(mapped.rows.appointmentEvent.appointmentId, appointmentTargetSnapshot.appointments[0].id);
  assert.equal(mapped.rows.appointmentEvent.actorUid, null);
  assert.equal(mapped.rows.appointmentEvent.action, undefined);
  assert.ok(mapped.blockers.includes('GUEST_RELATION_RELEASE_PENDING'));
  assert.ok(mapped.blockers.includes('EVENT_ACTION_PROVENANCE_PENDING'));
  const prepared = prepareMigrationTimestamps(mapAppointmentRecord(appointment, records, options));
  assert.equal(prepared.status, 'prepared');
  assert.equal(prepared.rows.appointment.patientId, null);
  assert.ok(prepared.blockers.includes('GUEST_RELATION_RELEASE_PENDING'));
  assert.equal(prepared.readyForApply, false);
});

test('guest rehearsal remains count-only, blocked and independent of record order', () => {
  const { records, options } = guest();
  const report = rehearse(records, options);
  assert.equal(report.appointmentAssessment.candidates, 2);
  assert.equal(report.appointmentAssessment.blockers.GUEST_RELATION_RELEASE_PENDING, 2);
  assert.equal(report.writes, 0); assert.equal(report.readyForApply, 0);
  assert.deepEqual(report.appointmentAssessment, rehearse([...records].reverse(), { ...options, pageSize: 1 }).appointmentAssessment);
  assert.doesNotMatch(JSON.stringify(report), /fixture|Synthetic|example.test|patientId|rows/);
});
