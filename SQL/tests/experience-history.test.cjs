const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixtures, targetSnapshot, patientTargetSnapshot, serviceTargetSnapshot, appointmentTargetSnapshot } = require('../migration/fixtures.cjs');
const { mapExperienceRecord, rehearse, legacyUuid } = require('../migration/rehearsal.cjs');
const { prepareMigrationTimestamps } = require('../migration/instant-preservation.cjs');
const feedback = fixtures.find(row => row.path.startsWith('patientFeedback/'));
const audit = fixtures.find(row => row.path.startsWith('auditLogs/'));
const options = { targetSnapshot, patientTargetSnapshot, serviceTargetSnapshot, appointmentTargetSnapshot, experienceTargetSnapshot: { complete: true, feedback: [], audit: [] } };
const replace = row => fixtures.filter(item => item.path !== row.path).concat(row);

test('feedback retains private state/comment and explicit relationships without publication or links', () => {
  const result = mapExperienceRecord(feedback, fixtures, options);
  assert.equal(result.status, 'mapped'); assert.equal(result.readyForApply, false);
  assert.equal(result.rows.legacyPatientFeedback.patientId, patientTargetSnapshot.patients[0].id);
  assert.equal(result.rows.legacyPatientFeedback.appointmentId, appointmentTargetSnapshot.appointments[0].id);
  assert.equal(result.rows.legacyPatientFeedback.comment, feedback.data.comment);
  assert.equal(result.rows.legacyPatientFeedback.status, 'pending');
  assert.ok(result.blockers.includes('FEEDBACK_PUBLICATION_CONSENT_REVIEW'));
  assert.ok(result.blockers.includes('FEEDBACK_APPOINTMENT_STATE_REVIEW'));
  assert.deepEqual(result.source, feedback);
  assert.deepEqual(Object.keys(result.rows), ['legacyPatientFeedback']);
});

test('all actual moderation states survive; missing evidence stays NULL and published is never approval', () => {
  for (const status of ['pending', 'published', 'rejected', 'unpublished']) {
    const row = { ...feedback, data: { ...feedback.data, status } };
    const result = mapExperienceRecord(row, replace(row), options);
    assert.equal(result.rows.legacyPatientFeedback.status, status);
    assert.equal(result.rows.legacyPatientFeedback.reviewedAt, null);
    assert.equal(result.rows.legacyPatientFeedback.publishedAt, null);
    assert.ok(result.blockers.includes('FEEDBACK_PUBLICATION_CONSENT_REVIEW'));
    if (status !== 'pending') assert.ok(result.blockers.includes('FEEDBACK_MODERATION_EVIDENCE_REVIEW'));
  }
});

test('feedback cannot switch patient/appointment or claim missing/guest relationships', () => {
  assert.equal(mapExperienceRecord(feedback, fixtures.filter(row => row.path !== 'patients/fixture-account'), options).reason, 'MISSING_REFERENCE');
  const other = { ...feedback, data: { ...feedback.data, appointmentId: 'missing' } };
  assert.equal(mapExperienceRecord(other, replace(other), options).reason, 'MISSING_REFERENCE');
  const records = structuredClone(fixtures);
  Object.assign(records.find(row => row.path === 'appointments/fixture-appointment').data, { patientId: null, source: 'web', createdBy: { uid: null, role: 'public' } });
  const opts = structuredClone(options); opts.appointmentTargetSnapshot.appointments[0].patientId = null;
  assert.equal(mapExperienceRecord(feedback, records, opts).reason, 'FEEDBACK_PATIENT_CONFLICT');
  for (const field of ['patientId', 'appointmentId']) {
    const opts = structuredClone(options); opts.experienceTargetSnapshot.feedback = [{ id: '00000000-0000-4000-8000-000000000093', legacyId: feedback.path, patientId: patientTargetSnapshot.patients[0].id, appointmentId: appointmentTargetSnapshot.appointments[0].id }];
    opts.experienceTargetSnapshot.feedback[0][field] = '00000000-0000-4000-8000-000000000099';
    assert.equal(mapExperienceRecord(feedback, fixtures, opts).reason, 'TARGET_RELATIONSHIP_CONFLICT');
  }
});

test('legacy IDs reuse target identities; incomplete/duplicate/natural-key adoption and ID collisions fail closed', () => {
  const opts = structuredClone(options);
  const row = { id: '00000000-0000-4000-8000-000000000094', legacyId: audit.path };
  opts.experienceTargetSnapshot.audit = [row];
  assert.equal(mapExperienceRecord(audit, fixtures, opts).rows.legacyAuditRecord.id, row.id);
  for (const patch of [{ complete: false }, { extra: true }, { feedback: undefined }, { audit: [row, row] }, { audit: Array(10001).fill(row) }, { audit: [{ ...row, legacyId: feedback.path }] }]) {
    assert.equal(mapExperienceRecord(audit, fixtures, { ...options, experienceTargetSnapshot: { ...options.experienceTargetSnapshot, ...patch } }).status, 'rejected');
  }
  opts.experienceTargetSnapshot.audit = [{ ...row, id: legacyUuid('audit', audit.path), legacyId: null }];
  assert.equal(mapExperienceRecord(audit, fixtures, opts).reason, 'TARGET_ID_CONFLICT');
  opts.experienceTargetSnapshot.audit = [];
  opts.experienceTargetSnapshot.feedback = [{ id: '00000000-0000-4000-8000-000000000093', legacyId: null, patientId: patientTargetSnapshot.patients[0].id, appointmentId: appointmentTargetSnapshot.appointments[0].id }];
  assert.equal(mapExperienceRecord(feedback, fixtures, opts).reason, 'TARGET_UNIQUE_CONFLICT');
  assert.ok(mapExperienceRecord(audit, fixtures).blockers.includes('EXPERIENCE_TARGET_IDENTITY_PENDING'));
});

test('audit history stays separate from trusted AuditLog and never reconstructs live Auth or resource grants', () => {
  const row = { ...audit, data: { ...audit.data, actor: { uid: null, role: 'receptionist' }, resource: { type: 'retired_resource', id: 'deleted-record' }, meta: { active: false, count: 0, fields: [], source: '' } } };
  const result = mapExperienceRecord(row, replace(row), options);
  assert.equal(result.status, 'mapped'); assert.equal(result.rows.auditLog, undefined);
  assert.equal(result.rows.legacyAuditRecord.actorRole, 'receptionist');
  assert.equal(result.rows.legacyAuditRecord.legacyResourceId, 'deleted-record');
  assert.deepEqual(JSON.parse(result.rows.legacyAuditRecord.legacyMetadata), row.data.meta);
  assert.ok(result.blockers.includes('AUDIT_ACTOR_PROVENANCE_REVIEW'));
  assert.ok(result.blockers.includes('AUDIT_RESOURCE_RECONCILIATION_PENDING'));
  assert.equal(result.readyForApply, false);
  const missing = { ...audit, data: {} };
  const absent = mapExperienceRecord(missing, replace(missing), options);
  assert.equal(absent.rows.legacyAuditRecord.action, null);
  assert.equal(absent.rows.legacyAuditRecord.occurredAt, null);
  assert.ok(absent.blockers.includes('AUDIT_ACTION_MISSING'));
});

test('actual audit metadata is allow-listed, validated and private; unknown clinical/secrets cannot be copied', () => {
  const row = { ...audit, data: { ...audit.data, meta: { doctorId: 'fixture-doctor', dateKey: '2026-10-20', fromDateKey: '2026-10-19', toDateKey: '2026-10-20', type: 'closed', action: 'cancel', sessionCount: 0, affectedAppointments: 1, indexed: 0, branchId: 'fixture-branch', bookingEnabled: true, publicBookingEnabled: false, feedbackId: 'fixture-feedback', fields: ['displayName', 'healthNotes'], visitMode: 'video', rating: 5 } } };
  assert.equal(mapExperienceRecord(row, replace(row), options).status, 'mapped');
  for (const meta of [{ notes: 'DO_NOT_LEAK' }, { refreshToken: 'DO_NOT_LEAK' }, { count: '1' }, { active: 'true' }, { dateKey: '2026-02-30' }, { fields: ['DO_NOT_LEAK'] }]) {
    const bad = { ...audit, data: { ...audit.data, meta } };
    const result = mapExperienceRecord(bad, replace(bad), options);
    assert.equal(result.status, 'rejected'); assert.doesNotMatch(JSON.stringify(result), /DO_NOT_LEAK/);
  }
});

test('invalid feedback values and duplicate sources reject without normalizing or leaking comments', () => {
  for (const patch of [{ rating: '5' }, { rating: 0 }, { rating: 5.5 }, { rating: 6 }, { status: 'approved' }, { comment: [] }, { reviewedBy: 42 }, { reviewedAt: 'tomorrow' }, { comment: 'bad\0text' }]) {
    const row = { ...feedback, data: { ...feedback.data, ...patch } };
    assert.equal(mapExperienceRecord(row, replace(row), options).status, 'rejected');
  }
  assert.equal(mapExperienceRecord(audit, [...fixtures, audit], options).reason, 'DUPLICATE_SOURCE');
});

test('exact moderation/audit timestamps preserve evidence and source comments remain untouched', () => {
  for (const source of [feedback, audit]) {
    const row = structuredClone(source);
    const field = source === audit ? 'at' : 'reviewedAt';
    row.data[field] = { seconds: 1792368000, nanoseconds: 123456789 };
    const mapped = mapExperienceRecord(row, replace(row), options);
    assert.equal(mapped.status, 'mapped');
    const prepared = prepareMigrationTimestamps(mapped);
    assert.equal(prepared.status, 'prepared'); assert.equal(prepared.readyForApply, false);
    assert.ok(prepared.rows.legacySourceInstants.some(value => value.exactValue.endsWith('123456789Z')));
    assert.ok(prepared.blockers.includes('TARGET_TIMESTAMP_PRECISION_LOSS'));
    assert.deepEqual(mapped.source, row);
  }
});

test('rehearsal reports feedback/audit counts only, never source contents or applied writes', () => {
  const report = rehearse(fixtures, options);
  assert.equal(report.experienceAssessment.candidates, 2); assert.equal(report.experienceAssessment.rejected, 0);
  assert.equal(report.writes, 0); assert.equal(report.readyForApply, 0); assert.equal(report.mapped, 3);
  assert.deepEqual(report.experienceAssessment, rehearse([...fixtures].reverse(), { ...options, pageSize: 1 }).experienceAssessment);
  assert.doesNotMatch(JSON.stringify(report), /fixture|Synthetic|rows|patientId|comment|legacyMetadata/);
});
