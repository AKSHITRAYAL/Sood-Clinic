const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixtures, targetSnapshot, patientTargetSnapshot, serviceTargetSnapshot, appointmentTargetSnapshot } = require('../migration/fixtures.cjs');
const { mapAppointmentRecord, rehearse } = require('../migration/rehearsal.cjs');
const appointment = fixtures.find(row => row.path === 'appointments/fixture-appointment');
const event = fixtures.find(row => row.path === 'appointments/fixture-appointment/events/fixture-event');
const options = { targetSnapshot, patientTargetSnapshot, serviceTargetSnapshot, appointmentTargetSnapshot };
const replace = row => fixtures.filter(item => item.path !== row.path).concat(row);
const at = '2026-10-19T00:00:00.123456Z';
function full() {
  const row = structuredClone(appointment);
  Object.assign(row.data, { phoneKey: 'synthetic-phone-key', slotId: 'old-slot', slotIds: ['slot-two', 'slot-one', 'slot-two'], externalCalendar: { provider: 'google', calendarId: 'synthetic-calendar', eventId: 'synthetic-event', syncStatus: 'synced', lastSyncedAt: at, lastSyncError: '' }, videoConsultation: { status: 'ready', joinUrl: 'https://example.test/meeting?token=synthetic-private', preparedBy: 'synthetic-staff', preparedAt: at }, cancellation: { byUid: 'synthetic-staff', byRole: 'manager', reason: 'Synthetic private cancellation', at }, updatedAt: at });
  return row;
}

test('snapshots, clinical reason, video and Calendar metadata are preserved in private rows keyed by resolved ID', () => {
  const row = full(); const result = mapAppointmentRecord(row, replace(row), options);
  assert.equal(result.status, 'mapped');
  const details = result.rows.appointmentPrivateDetails;
  assert.equal(details.appointmentId, appointmentTargetSnapshot.appointments[0].id);
  assert.equal(details.snapshotName, row.data.patientSnapshot.name);
  assert.equal(details.reason, row.data.reason);
  assert.equal(details.calendarEventId, 'synthetic-event');
  assert.equal(details.videoJoinUrl, row.data.videoConsultation.joinUrl);
  assert.equal(details.cancellationReason, row.data.cancellation.reason);
  assert.equal(details.calendarLastSyncedAt, at);
  assert.equal(details.calendarLastSyncError, '');
  assert.equal(result.rows.appointment.departmentId, targetSnapshot.departments[0].id);
  assert.equal(result.rows.appointment.visitMode, 'in_person');
  assert.equal(result.rows.appointment.createdByRole, 'patient');
  assert.equal(result.rows.appointment.reason, undefined);
  assert.equal(result.rows.appointment.videoJoinUrl, undefined);
  assert.equal(result.readyForApply, false);
  assert.ok(!result.blockers.includes('APPOINTMENT_TARGET_FIELD_PENDING'));
  assert.doesNotMatch(JSON.stringify(result.coverage), /synthetic-private|Synthetic|synthetic-calendar/);
});

test('legacy slot order and duplicates survive as ordinal rows without becoming SQL occupancy', () => {
  const row = full(); const result = mapAppointmentRecord(row, replace(row), options);
  assert.equal(result.rows.appointmentPrivateDetails.legacySlotId, 'old-slot');
  assert.equal(result.rows.appointmentPrivateDetails.legacySlotListPresent, true);
  assert.deepEqual(result.rows.appointmentLegacySlots.map(item => [item.ordinal, item.legacySlotId, item.appointmentId]), row.data.slotIds.map((id, i) => [i, id, result.rows.appointment.id]));
  assert.equal(result.rows.occupancy, undefined);
  row.data.slotIds = [];
  assert.equal(mapAppointmentRecord(row, replace(row), options).rows.appointmentPrivateDetails.legacySlotListPresent, true);
  delete row.data.slotIds;
  assert.equal(mapAppointmentRecord(row, replace(row), options).rows.appointmentPrivateDetails.legacySlotListPresent, false);
});

test('actual in-person null video and public actor shapes are accepted without creating ownership', () => {
  const row = structuredClone(appointment); row.data.videoConsultation = null; row.data.createdBy = { uid: null, role: 'public' };
  const result = mapAppointmentRecord(row, replace(row), options);
  assert.equal(result.status, 'mapped');
  assert.equal(result.rows.appointment.createdByRole, 'public');
  assert.equal(result.rows.appointmentPrivateDetails.videoStatus, null);
  assert.equal(result.rows.patientLinks, undefined);
  row.data.patientId = null;
  assert.equal(mapAppointmentRecord(row, replace(row), options).reason, 'MISSING_REFERENCE');
});

test('timestamps in private metadata validate exact precision and cannot be silently rounded', () => {
  const row = full(); row.data.videoConsultation.preparedAt = { seconds: 1792368000, nanoseconds: 123456789 };
  const result = mapAppointmentRecord(row, replace(row), options);
  assert.equal(result.status, 'mapped');
  assert.deepEqual(result.rows.appointmentPrivateDetails.videoPreparedAt, row.data.videoConsultation.preparedAt);
  assert.ok(result.blockers.includes('TARGET_TIMESTAMP_PRECISION_LOSS'));
  assert.ok(result.coverage.fields.some(field => field.source === 'videoConsultation.preparedAt' && field.status === 'blocked'));
  row.data.cancellation.at = 'yesterday';
  assert.equal(mapAppointmentRecord(row, replace(row), options).status, 'rejected');
});

test('unsafe video links, malformed nested values and unknown credential fields fail closed', () => {
  for (const url of ['javascript:alert(1)', 'http://example.test/room', 'https://user:password@example.test/room']) {
    const row = full(); row.data.videoConsultation.joinUrl = url;
    assert.equal(mapAppointmentRecord(row, replace(row), options).status, 'rejected');
  }
  const row = full(); row.data.externalCalendar.refreshToken = 'DO_NOT_LEAK';
  const result = mapAppointmentRecord(row, replace(row), options);
  assert.equal(result.reason, 'UNKNOWN_FIELD');
  assert.doesNotMatch(JSON.stringify(result), /DO_NOT_LEAK|refreshToken|synthetic/);
  delete row.data.externalCalendar.refreshToken; row.data.videoConsultation.preparedBy = 123;
  assert.equal(mapAppointmentRecord(row, replace(row), options).status, 'rejected');
});

test('event reasons and explicit reschedule metadata are retained without guessing missing actions', () => {
  const row = { ...event, data: { ...event.data, reason: 'Synthetic sensitive history', createdAt: at, updatedAt: at, meta: { action: 'rescheduled', fromDateKey: '2026-10-19', toDateKey: '2026-10-20', toTime: '08:00', source: 'patient_portal' } } };
  const result = mapAppointmentRecord(row, replace(row), options);
  assert.equal(result.status, 'mapped');
  assert.equal(result.rows.appointmentEvent.legacyReason, row.data.reason);
  assert.equal(result.rows.appointmentEvent.legacyMetaAction, 'rescheduled');
  assert.equal(result.rows.appointmentEvent.legacyToTime, '08:00');
  assert.equal(result.rows.appointmentEvent.legacyCreatedAt, at);
  assert.equal(result.rows.appointmentEvent.action, undefined);
  assert.ok(result.blockers.includes('EVENT_ACTION_PROVENANCE_PENDING'));
  row.data.meta.toDateKey = '2026-02-31';
  assert.equal(mapAppointmentRecord(row, replace(row), options).status, 'rejected');
});

test('private appointment projection and all reports never publish clinical or video-link contents', () => {
  const row = full(); const result = rehearse(replace(row), options);
  assert.equal(result.appointmentAssessment.candidates, 2);
  assert.equal(result.readyForApply, 0);
  assert.equal(result.writes, 0);
  assert.doesNotMatch(JSON.stringify(result), /synthetic-private|synthetic-event|Synthetic|example.test|snapshotName|rows/);
});
