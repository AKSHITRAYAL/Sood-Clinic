const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixtures, targetSnapshot, patientTargetSnapshot } = require('../migration/fixtures.cjs');
const { mapAppointmentRecord, timestampNanos, rehearse, legacyUuid } = require('../migration/rehearsal.cjs');
const appointment = fixtures.find(row => row.path === 'appointments/fixture-appointment');
const event = fixtures.find(row => row.path === 'appointments/fixture-appointment/events/fixture-event');
const options = { targetSnapshot, patientTargetSnapshot };
const replace = row => fixtures.filter(item => item.path !== row.path).concat(row);

test('appointment candidate resolves explicit references and configured service without granting ownership', () => {
  const result = mapAppointmentRecord(appointment, fixtures, options);
  assert.equal(result.status, 'mapped');
  assert.equal(result.readyForApply, false);
  assert.equal(result.rows.appointment.patientId, patientTargetSnapshot.patients[0].id);
  assert.equal(result.rows.appointment.doctorId, targetSnapshot.doctors[0].id);
  assert.equal(result.rows.appointment.branchId, targetSnapshot.branches[0].id);
  assert.equal(result.rows.appointment.serviceId, legacyUuid('service', 'consultation'));
  assert.equal(result.rows.patientLinks, undefined);
  assert.deepEqual(result.source, appointment);
  for (const reason of ['SERVICE_TARGET_IDENTITY_UNCHECKED', 'HISTORICAL_SERVICE_VERSION_REVIEW', 'APPOINTMENT_TARGET_IDENTITY_PENDING', 'APPOINTMENT_CUTOVER_PENDING']) assert.ok(result.blockers.includes(reason));
  assert.equal(result.rows.appointmentPrivateDetails.reason, appointment.data.reason);
  assert.doesNotMatch(JSON.stringify(result.coverage), /Synthetic|fixture|example.test/);
});

test('timestamps compare at nanosecond precision and validate IST date rather than UTC date', () => {
  assert.equal(timestampNanos('2026-10-19T18:30:00.123456789Z'), timestampNanos({ seconds: 1792434600, nanoseconds: 123456789 }));
  assert.throws(() => timestampNanos('2026-02-31T00:00:00Z'), /INVALID_TIMESTAMP/);
  assert.equal(timestampNanos('1969-12-31T23:59:59.999999999Z'), -1n);
  const row = { ...appointment, data: { ...appointment.data, dateKey: '2026-10-20', startsAt: '2026-10-19T18:30:00.000000001Z', endsAt: '2026-10-19T18:30:00.000000002Z' } };
  const result = mapAppointmentRecord(row, replace(row), options);
  assert.equal(result.status, 'mapped');
  assert.ok(result.blockers.includes('TARGET_TIMESTAMP_PRECISION_LOSS'));
  assert.equal(result.rows.appointment.startsAt, row.data.startsAt);
  const wrongDay = { ...row, data: { ...row.data, dateKey: '2026-10-19' } };
  assert.equal(mapAppointmentRecord(wrongDay, replace(wrongDay), options).reason, 'APPOINTMENT_DATE_MISMATCH');
  const reversed = { ...row, data: { ...row.data, endsAt: row.data.startsAt } };
  assert.equal(mapAppointmentRecord(reversed, replace(reversed), options).reason, 'INVALID_APPOINTMENT_INTERVAL');
  const objects = structuredClone(appointment);
  for (const field of ['startsAt', 'endsAt']) objects.data[field] = { seconds: Number(timestampNanos(appointment.data[field]) / 1000000000n), nanoseconds: 0 };
  objects.data.consent.acceptedAt = { seconds: 1792368000, nanoseconds: 123456789 };
  assert.equal(mapAppointmentRecord(objects, replace(objects), options).status, 'mapped');
});

test('duplicate reference/source, missing patient and cross-branch doctor references fail closed', () => {
  assert.equal(mapAppointmentRecord(appointment, [...fixtures, appointment], options).reason, 'DUPLICATE_SOURCE');
  assert.equal(mapAppointmentRecord(appointment, [...fixtures, { ...appointment, path: 'appointments/other' }], options).reason, 'DUPLICATE_APPOINTMENT_REFERENCE');
  assert.equal(mapAppointmentRecord(appointment, fixtures.filter(row => !row.path.startsWith('patients/')), options).reason, 'MISSING_REFERENCE');
  const row = { ...appointment, data: { ...appointment.data, branchId: 'missing' } };
  assert.equal(mapAppointmentRecord(row, replace(row), options).reason, 'MISSING_REFERENCE');
  const missing = { ...appointment, data: { ...appointment.data, patientId: 'unknown-but-matching-phone' } };
  assert.equal(mapAppointmentRecord(missing, replace(missing), options).reason, 'MISSING_REFERENCE');
  const department = fixtures.find(row => row.path === 'departments/fixture-department');
  const otherDepartment = { ...department, path: 'departments/other', data: { ...department.data, code: 'OTHER' } };
  const mismatched = { ...appointment, data: { ...appointment.data, departmentId: 'other' } };
  assert.equal(mapAppointmentRecord(mismatched, [...replace(mismatched), otherDepartment], options).reason, 'APPOINTMENT_RELATIONSHIP_CONFLICT');
});

test('unknown state/mode and malformed actor/consent are rejected, absent historical consent is blocked', () => {
  for (const data of [{ status: 'checked-in' }, { visitMode: 'telephone' }, { startsAt: 'tomorrow' }, { createdBy: { uid: 12, role: 'patient' } }, { consent: { version: 'v1', acceptedAt: 'not-an-instant' } }]) {
    const row = { ...appointment, data: { ...appointment.data, ...data } };
    assert.equal(mapAppointmentRecord(row, replace(row), options).status, 'rejected');
  }
  const row = structuredClone(appointment); delete row.data.consent;
  const result = mapAppointmentRecord(row, replace(row), options);
  assert.equal(result.status, 'mapped');
  assert.equal(result.rows.appointment.consentVersion, null);
  assert.ok(result.blockers.includes('HISTORICAL_CONSENT_MISSING'));
});

test('missing source timestamps stay blocked while sensitive fields map only to private details', () => {
  const result = mapAppointmentRecord(appointment, fixtures, options);
  assert.ok(result.blockers.includes('SOURCE_UPDATED_AT_MISSING'));
  assert.ok(result.coverage.fields.some(field => field.source === 'patientSnapshot' && field.status === 'mapped'));
  const row = { ...appointment, data: { ...appointment.data, externalCalendar: { provider: 'google', syncStatus: 'synced' }, videoConsultation: { status: 'ready' } } };
  const mapped = mapAppointmentRecord(row, replace(row), options);
  for (const source of ['externalCalendar', 'videoConsultation']) assert.ok(mapped.coverage.fields.some(field => field.source === source && field.status === 'mapped'));
  assert.equal(mapped.rows.appointment.reason, undefined);
});

test('history IDs use qualified paths and no action, consent or audit actor is fabricated', () => {
  const result = mapAppointmentRecord(event, fixtures, options);
  assert.equal(result.status, 'mapped');
  assert.equal(result.rows.appointmentEvent.id, legacyUuid('appointment_event', event.path));
  assert.equal(result.rows.appointmentEvent.appointmentId, legacyUuid('appointment', 'fixture-appointment'));
  assert.equal(result.rows.appointmentEvent.action, undefined);
  assert.ok(result.blockers.includes('EVENT_ACTION_PROVENANCE_PENDING'));
  assert.equal(result.rows.appointmentEvent.actorRole, 'patient');
  assert.equal(mapAppointmentRecord(event, fixtures.filter(row => row !== appointment), options).reason, 'MISSING_REFERENCE');
  const row = { ...event, data: { ...event.data, to: 'mystery' } };
  assert.equal(mapAppointmentRecord(row, replace(row), options).status, 'rejected');
});

test('count reports summarize appointment/event candidates without patient data or access grants', () => {
  const result = rehearse(fixtures, options);
  assert.equal(result.appointmentAssessment.assessed, 2);
  assert.equal(result.appointmentAssessment.candidates, 2);
  assert.equal(result.writes, 0);
  assert.equal(result.readyForApply, 0);
  assert.equal(result.mapped, 3);
  assert.deepEqual(result.appointmentAssessment, rehearse([...fixtures].reverse(), { ...options, pageSize: 1 }).appointmentAssessment);
  assert.doesNotMatch(JSON.stringify(result), /fixture|Synthetic|example.test|patientId|rows/);
});
