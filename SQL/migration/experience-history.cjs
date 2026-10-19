const { canonicalUuid, legacyUuid } = require('./catalog-identity.cjs');
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const reject = code => { throw Object.assign(new Error(code), { migrationCode: code }); };
const text = (value, max = 512) => {
  if (value !== null && (typeof value !== 'string' || value.length > max || value.includes('\0'))) reject('INVALID_HISTORY_FIELD');
  return value;
};

function historyIdentity(snapshot, kind, path, candidate) {
  const supplied = snapshot !== undefined;
  if (supplied && (!plain(snapshot) || snapshot.complete !== true || Reflect.ownKeys(snapshot).some(key => !['complete', 'feedback', 'audit'].includes(key)) || !Array.isArray(snapshot.feedback) || !Array.isArray(snapshot.audit) || snapshot.feedback.length + snapshot.audit.length > 10000)) reject('INVALID_TARGET_SNAPSHOT');
  const id = legacyUuid(kind, path); let existing; let collision = false; let appointmentConflict = false;
  for (const key of ['feedback', 'audit']) {
    const ids = new Set(); const legacyIds = new Set(); const appointments = new Set();
    for (const target of supplied ? snapshot[key] : []) {
      const relations = key === 'feedback' ? ['patientId', 'appointmentId'] : [];
      const allowed = ['id', 'legacyId', ...relations];
      if (!plain(target) || Reflect.ownKeys(target).some(field => !allowed.includes(field)) || !(target.legacyId === null || (typeof target.legacyId === 'string' && target.legacyId.length <= 512 && new RegExp(`^${key === 'feedback' ? 'patientFeedback' : 'auditLogs'}/[^/]+$`).test(target.legacyId)))) reject('INVALID_TARGET_SNAPSHOT');
      const row = { id: canonicalUuid(target.id), legacyId: target.legacyId };
      for (const field of relations) row[field] = canonicalUuid(target[field]);
      if (ids.has(row.id) || (row.legacyId !== null && legacyIds.has(row.legacyId)) || (key === 'feedback' && appointments.has(row.appointmentId))) reject('INVALID_TARGET_SNAPSHOT');
      ids.add(row.id); if (row.legacyId !== null) legacyIds.add(row.legacyId);
      if (key === 'feedback') appointments.add(row.appointmentId);
      if (kind !== key) continue;
      if (row.id === id) collision = true;
      if (row.legacyId === path) existing = row;
      else if (key === 'feedback' && row.appointmentId === candidate.appointmentId) appointmentConflict = true;
    }
  }
  if (appointmentConflict) reject('TARGET_UNIQUE_CONFLICT');
  if (existing) {
    if (kind === 'feedback') for (const field of ['patientId', 'appointmentId']) if (existing[field] !== candidate[field]) reject('TARGET_RELATIONSHIP_CONFLICT');
    return { id: existing.id, decision: 'reuse_existing', snapshotChecked: supplied };
  }
  if (collision) reject('TARGET_ID_CONFLICT');
  return { id, decision: 'new_candidate', snapshotChecked: supplied };
}

function mapExperienceRecord(record, records, options = {}) {
  const { inspectRecord, mapPatientRecord, mapAppointmentRecord, timestampNanos, validDate, manifest } = require('./rehearsal.cjs');
  try {
    const inspection = inspectRecord(record);
    if (inspection.status === 'rejected') return inspection;
    if (!['feedback', 'audit'].includes(inspection.category)) reject('NOT_AN_EXPERIENCE_RECORD');
    if (!Array.isArray(records) || records.length > 10000) reject('INVALID_BATCH');
    if (records.filter(item => item.source === record.source && item.path === record.path).length !== 1) reject('DUPLICATE_SOURCE');
    const kind = inspection.category; const data = record.data;
    const blockers = new Set(['EXPERIENCE_SCHEMA_RELEASE_PENDING', 'EXPERIENCE_CUTOVER_PENDING']);
    const instant = value => {
      if (value === undefined || value === null) return null;
      if (timestampNanos(value) % 1000n) blockers.add('TARGET_TIMESTAMP_PRECISION_LOSS');
      return value;
    };
    let row; let targets;
    if (kind === 'feedback') {
      const dependency = (collection, id, mapper, snapshot) => {
        if (typeof id !== 'string' || !id || id.includes('/')) reject('MISSING_REFERENCE');
        const matches = records.filter(item => item.source === 'firestore' && item.path === `${collection}/${id}`);
        if (matches.length !== 1) reject('MISSING_REFERENCE');
        const mapped = mapper(matches[0], records, snapshot);
        if (mapped.status !== 'mapped') reject('MISSING_REFERENCE');
        for (const reason of mapped.blockers || []) blockers.add(reason);
        if (!mapped.targetSnapshotChecked) blockers.add('EXPERIENCE_DEPENDENCY_IDENTITY_UNCHECKED');
        return mapped;
      };
      const patient = dependency('patients', data.patientId, mapPatientRecord, options.patientTargetSnapshot);
      const appointment = dependency('appointments', data.appointmentId, mapAppointmentRecord, options);
      if (appointment.rows.appointment.patientId !== patient.rows.patient.id) reject('FEEDBACK_PATIENT_CONFLICT');
      if (records.filter(item => item.source === 'firestore' && /^patientFeedback\/[^/]+$/.test(item.path) && item.data?.appointmentId === data.appointmentId).length !== 1) reject('DUPLICATE_FEEDBACK_APPOINTMENT');
      if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5 || !['pending', 'published', 'rejected', 'unpublished'].includes(data.status)) reject('INVALID_FEEDBACK_FIELD');
      row = { legacyId: record.path, patientId: patient.rows.patient.id, appointmentId: appointment.rows.appointment.id, rating: data.rating, comment: text(data.comment ?? null, 100000), status: data.status, reviewedBy: text(data.reviewedBy ?? null, 128), reviewedAt: instant(data.reviewedAt), publishedAt: instant(data.publishedAt), createdAt: instant(data.createdAt), updatedAt: instant(data.updatedAt) };
      blockers.add('FEEDBACK_PUBLICATION_CONSENT_REVIEW');
      if (appointment.rows.appointment.status !== 'completed') blockers.add('FEEDBACK_APPOINTMENT_STATE_REVIEW');
      if (!row.comment || row.comment.trim().length < 10) blockers.add('FEEDBACK_COMMENT_REVIEW');
      if (data.status !== 'pending' && (!row.reviewedAt || !row.reviewedBy || (data.status === 'published' && !row.publishedAt))) blockers.add('FEEDBACK_MODERATION_EVIDENCE_REVIEW');
      if (data.status !== 'published' && row.publishedAt) blockers.add('FEEDBACK_MODERATION_EVIDENCE_REVIEW');
      for (const field of ['createdAt', 'updatedAt']) if (row[field] === null) blockers.add(field === 'createdAt' ? 'SOURCE_CREATED_AT_MISSING' : 'SOURCE_UPDATED_AT_MISSING');
      targets = Object.fromEntries(Object.keys(data).map(field => [field, `LegacyPatientFeedback.${field}`]));
    } else {
      row = { legacyId: record.path, actorUid: text(data.actor?.uid ?? null, 128), actorRole: text(data.actor?.role ?? null, 120), action: text(data.action ?? null, 160), resourceType: text(data.resource?.type ?? null, 160), legacyResourceId: text(data.resource?.id ?? null), occurredAt: instant(data.at), legacyCreatedAt: instant(data.createdAt), legacyUpdatedAt: instant(data.updatedAt), legacyMetadata: null };
      for (const reason of ['AUDIT_ACTOR_PROVENANCE_REVIEW', 'AUDIT_RESOURCE_RECONCILIATION_PENDING', 'AUDIT_DEDUPLICATION_REVIEW']) blockers.add(reason);
      if (!row.action) blockers.add('AUDIT_ACTION_MISSING');
      if (!row.occurredAt) blockers.add('AUDIT_TIME_MISSING');
      if (!row.actorRole) blockers.add('AUDIT_ACTOR_MISSING');
      if (!row.resourceType || !row.legacyResourceId) blockers.add('AUDIT_RESOURCE_MISSING');
      if (data.meta !== undefined) {
        const counters = new Set(['sessionCount', 'affectedAppointments', 'indexed', 'count']);
        const flags = new Set(['active', 'bookingEnabled', 'publicBookingEnabled']);
        const metadata = {};
        for (const field of Object.keys(data.meta).sort()) {
          const value = data.meta[field];
          if (field === 'fields') {
            if (!Array.isArray(value) || value.length > 1000 || value.some(item => typeof item !== 'string' || !manifest.patients.fields.includes(item) || /[.\[\]]/.test(item))) reject('INVALID_AUDIT_METADATA');
          } else if (counters.has(field)) { if (!Number.isInteger(value) || value < 0 || value > 2147483647) reject('INVALID_AUDIT_METADATA'); }
          else if (flags.has(field)) { if (typeof value !== 'boolean') reject('INVALID_AUDIT_METADATA'); }
          else if (field === 'rating') { if (!Number.isInteger(value) || value < 1 || value > 5) reject('INVALID_AUDIT_METADATA'); }
          else { text(value); if (field.endsWith('DateKey') || field === 'dateKey') if (!validDate(value)) reject('INVALID_AUDIT_METADATA'); }
          metadata[field] = value;
        }
        row.legacyMetadata = JSON.stringify(metadata);
        blockers.add('AUDIT_METADATA_PRIVACY_REVIEW');
      }
      targets = { at: 'LegacyAuditRecord.occurredAt', actor: 'LegacyAuditRecord.actorUid/actorRole', action: 'LegacyAuditRecord.action', resource: 'LegacyAuditRecord.resourceType/legacyResourceId', meta: 'LegacyAuditRecord.legacyMetadata', createdAt: 'LegacyAuditRecord.legacyCreatedAt', updatedAt: 'LegacyAuditRecord.legacyUpdatedAt' };
    }
    const identity = historyIdentity(options.experienceTargetSnapshot, kind, record.path, row);
    row.id = identity.id;
    if (!identity.snapshotChecked) blockers.add('EXPERIENCE_TARGET_IDENTITY_PENDING');
    const fields = Object.keys(data).sort().map(source => ({ source, target: targets[source], status: 'mapped' }));
    return { status: 'mapped', readyForApply: false, identityDecision: identity.decision, targetSnapshotChecked: identity.snapshotChecked, rows: { [kind === 'feedback' ? 'legacyPatientFeedback' : 'legacyAuditRecord']: row }, blockers: [...blockers].sort(), coverage: { fields, mapped: fields.length, blocked: 0 }, source: structuredClone(record) };
  } catch (error) { return { status: 'rejected', reason: error.migrationCode || 'INVALID_EXPERIENCE_RECORD' }; }
}
module.exports = { mapExperienceRecord };
