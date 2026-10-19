const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixtures, targetSnapshot, patientTargetSnapshot } = require('../migration/fixtures.cjs');
const { mapBookingConfig, mapAppointmentRecord, rehearse, legacyUuid } = require('../migration/rehearsal.cjs');
const source = fixtures.find(row => row.path === 'clinic/publicConfig');
const at = '2026-10-19T00:00:00.123456Z';
const complete = () => ({ ...source, data: { ...source.data, timezone: 'Asia/Kolkata', slotMinutes: 20, intervalMinutes: 10, bufferBeforeMinutes: 5, bufferAfterMinutes: 15, autoConfirm: false, patientCancellationCutoffHours: 2, updatedBy: 'synthetic-operator', createdAt: at, updatedAt: at, visitTypes: [{ ...source.data.visitTypes[0], active: true }] } });
const replace = row => fixtures.filter(item => item.path !== row.path).concat(row);
const serviceTargetSnapshot = { complete: true, services: [{ id: '00000000-0000-4000-8000-000000000055', legacyId: 'consultation', code: 'consultation' }] };

test('configuration preserves separate buffers, exact time, order and paise without touching SQL contact', () => {
  const row = complete(); Object.assign(row.data, { name: 'Old contact', email: 'old@example.test' });
  const mapped = mapBookingConfig(row, replace(row), serviceTargetSnapshot);
  assert.equal(mapped.status, 'mapped');
  assert.equal(mapped.readyForApply, false);
  assert.equal(mapped.rows.clinicSettings.cancelCutoffMinutes, 120);
  assert.equal(mapped.rows.clinicSettings.bufferBeforeMinutes, 5);
  assert.equal(mapped.rows.clinicSettings.bufferAfterMinutes, 15);
  assert.equal(mapped.rows.clinicSettings.updatedAt, at);
  assert.equal(mapped.rows.services[0].id, serviceTargetSnapshot.services[0].id);
  assert.equal(mapped.rows.services[0].feePaise, 25000);
  assert.equal(mapped.rows.services[0].legacySortOrder, 0);
  assert.equal(mapped.rows.clinicProfile, undefined);
  assert.equal(mapped.rows.doctorServices, undefined);
  assert.ok(mapped.blockers.includes('SQL_CONTACT_AUTHORITY_REVIEW'));
  assert.ok(mapped.blockers.includes('DOCTOR_SERVICE_ASSIGNMENT_REVIEW'));
  assert.deepEqual(mapped.source, row);
  assert.doesNotMatch(JSON.stringify(mapped.coverage), /Old contact|old@example|synthetic-operator/);
});

test('absent settings and flags stay null and blocked; zero, false and empty lists are preserved', () => {
  const mapped = mapBookingConfig(source, fixtures);
  assert.equal(mapped.status, 'mapped');
  assert.equal(mapped.rows.clinicSettings.autoConfirm, null);
  assert.equal(mapped.rows.services[0].active, null);
  assert.ok(mapped.blockers.includes('CONFIG_FIELD_MISSING'));
  assert.ok(mapped.blockers.includes('SERVICE_ACTIVE_MISSING'));
  const row = complete(); Object.assign(row.data, { leadMinutes: 0, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, patientCancellationCutoffHours: 0, visitTypes: [] });
  const result = mapBookingConfig(row, replace(row), { complete: true, services: [] });
  assert.equal(result.rows.clinicSettings.cancelCutoffMinutes, 0);
  assert.deepEqual(result.rows.services, []);
  assert.ok(result.blockers.includes('LEGACY_VISIT_TYPES_EMPTY_REVIEW'));
  assert.ok(!result.blockers.includes('CONFIG_FIELD_MISSING'));
});

test('malformed config, duplicate formats, unknown fields and coercible values fail closed', () => {
  for (const patch of [{ intervalMinutes: '10' }, { bufferBeforeMinutes: -1 }, { bookingWindowDays: 91 }, { autoConfirm: 'false' }, { timezone: 'UTC' }, { visitTypes: [{ id: 'x', label: 'X', minutes: '20', mode: 'in_person' }] }, { visitTypes: [{ id: 'x', label: 'X', minutes: 20, mode: 'telephone' }] }, { visitTypes: [{ id: 'x', label: 'X', minutes: 20, mode: 'video', feePaise: 1.5 }] }, { visitTypes: [{ id: 'x', label: 'X', minutes: 20, mode: 'video', active: 1 }] }]) {
    const row = complete(); Object.assign(row.data, patch);
    assert.equal(mapBookingConfig(row, replace(row)).status, 'rejected');
  }
  const row = complete(); row.data.visitTypes.push({ ...row.data.visitTypes[0] });
  assert.equal(mapBookingConfig(row, replace(row)).reason, 'DUPLICATE_SERVICE_CODE');
  row.data.visitTypes = [{ ...row.data.visitTypes[0], unknown: 'private' }];
  assert.equal(mapBookingConfig(row, replace(row)).reason, 'UNKNOWN_FIELD');
  assert.equal(mapBookingConfig(source, [...fixtures, source]).reason, 'DUPLICATE_SOURCE');
});

test('service identity reuses explicit legacy mapping and rejects natural-key adoption or partial snapshots', () => {
  const row = complete();
  for (const snapshot of [{ complete: false, services: [] }, { complete: true }, { complete: true, services: [{ ...serviceTargetSnapshot.services[0], legacyId: null }] }, { ...serviceTargetSnapshot, extra: true }, { complete: true, services: [...serviceTargetSnapshot.services, ...serviceTargetSnapshot.services] }]) {
    assert.equal(mapBookingConfig(row, replace(row), snapshot).status, 'rejected');
  }
  const mapped = mapBookingConfig(row, replace(row), { complete: true, services: [] });
  assert.equal(mapped.rows.services[0].id, legacyUuid('service', 'consultation'));
  assert.equal(mapped.targetSnapshotChecked, true);
  assert.equal(mapBookingConfig(row, replace(row)).targetSnapshotChecked, false);
  const collision = { complete: true, services: [{ id: legacyUuid('service', 'consultation'), code: 'other', legacyId: 'other' }] };
  assert.equal(mapBookingConfig(row, replace(row), collision).reason, 'TARGET_ID_CONFLICT');
});

test('precision and missing service mode remain blockers rather than silently using runtime fallbacks', () => {
  const row = complete(); row.data.updatedAt = '2026-10-19T00:00:00.123456789Z'; delete row.data.visitTypes[0].mode;
  const mapped = mapBookingConfig(row, replace(row));
  assert.equal(mapped.status, 'mapped');
  assert.equal(mapped.rows.services[0].consultationMode, null);
  assert.ok(mapped.blockers.includes('TARGET_TIMESTAMP_PRECISION_LOSS'));
  assert.ok(mapped.coverage.fields.some(field => field.source === 'updatedAt' && field.status === 'blocked'));
  assert.ok(mapped.blockers.includes('SERVICE_MODE_MISSING'));
  assert.equal(mapped.rows.services[0].updatedAt, row.data.updatedAt);
});

test('appointment resolves configured service and blocks removed formats and mode mismatches', () => {
  const row = complete(); const records = replace(row);
  const appointment = fixtures.find(item => item.path === 'appointments/fixture-appointment');
  const options = { targetSnapshot, patientTargetSnapshot, serviceTargetSnapshot };
  const mapped = mapAppointmentRecord(appointment, records, options);
  assert.equal(mapped.status, 'mapped');
  assert.equal(mapped.rows.appointment.serviceId, serviceTargetSnapshot.services[0].id);
  assert.ok(!mapped.blockers.includes('SERVICE_IDENTITY_MAPPING_PENDING'));
  assert.ok(mapped.blockers.includes('DOCTOR_SERVICE_ASSIGNMENT_REVIEW'));
  const unknown = structuredClone(appointment); unknown.data.visitType = 'retired-format';
  const unresolved = mapAppointmentRecord(unknown, records.filter(item => item.path !== unknown.path).concat(unknown), options);
  assert.equal(unresolved.status, 'mapped');
  assert.equal(unresolved.rows.appointment.serviceId, undefined);
  assert.ok(unresolved.blockers.includes('HISTORICAL_SERVICE_UNRESOLVED'));
  const mismatched = structuredClone(appointment); mismatched.data.visitMode = 'video';
  assert.ok(mapAppointmentRecord(mismatched, records.filter(item => item.path !== mismatched.path).concat(mismatched), options).blockers.includes('HISTORICAL_SERVICE_MODE_MISMATCH'));
});

test('configuration report contains counts only and is stable across input order', () => {
  const report = rehearse(fixtures, { serviceTargetSnapshot });
  assert.equal(report.configAssessment.assessed, 1);
  assert.equal(report.configAssessment.candidates, 1);
  assert.equal(report.configAssessment.services, 1);
  assert.deepEqual(report.configAssessment, rehearse([...fixtures].reverse(), { serviceTargetSnapshot, pageSize: 1 }).configAssessment);
  assert.doesNotMatch(JSON.stringify(report), /fixture|Synthetic|example.test|rows/);
  assert.equal(report.writes, 0);
});
