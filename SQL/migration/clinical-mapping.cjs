const { canonicalUuid, legacyUuid } = require('./catalog-identity.cjs');
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const reject = code => { throw Object.assign(new Error(code), { migrationCode: code }); };
const text = (value, max = 100000) => {
  if (value !== null && (typeof value !== 'string' || value.length > max || value.includes('\0'))) reject('INVALID_CLINICAL_FIELD');
  return value;
};

function clinicalIdentity(snapshot, kind, path, row) {
  const supplied = snapshot !== undefined;
  if (supplied && (!plain(snapshot) || snapshot.complete !== true || Reflect.ownKeys(snapshot).some(key => !['complete', 'histories', 'documents'].includes(key)) || !Array.isArray(snapshot.histories) || !Array.isArray(snapshot.documents) || snapshot.histories.length + snapshot.documents.length > 10000)) reject('INVALID_TARGET_SNAPSHOT');
  let existing; let collision = false;
  const id = legacyUuid(kind, path);
  for (const [key, child] of [['histories', 'medicalHistory'], ['documents', 'medicalDocuments']]) {
    const ids = new Set(); const legacyIds = new Set();
    for (const target of supplied ? snapshot[key] : []) {
      if (!plain(target) || Reflect.ownKeys(target).some(field => !['id', 'legacyId', 'patientId', 'doctorId'].includes(field)) || !(target.legacyId === null || (typeof target.legacyId === 'string' && target.legacyId.length <= 512 && new RegExp(`^patients/[^/]+/${child}/[^/]+$`).test(target.legacyId)))) reject('INVALID_TARGET_SNAPSHOT');
      const value = { id: canonicalUuid(target.id), legacyId: target.legacyId, patientId: canonicalUuid(target.patientId), doctorId: target.doctorId === null ? null : canonicalUuid(target.doctorId) };
      if (ids.has(value.id) || (value.legacyId !== null && legacyIds.has(value.legacyId))) reject('INVALID_TARGET_SNAPSHOT');
      ids.add(value.id); if (value.legacyId !== null) legacyIds.add(value.legacyId);
      if (key !== (kind === 'medical_history' ? 'histories' : 'documents')) continue;
      if (value.id === id) collision = true;
      if (value.legacyId === path) existing = value;
    }
  }
  if (existing) {
    for (const field of ['patientId', 'doctorId']) if (existing[field] !== row[field]) reject('TARGET_RELATIONSHIP_CONFLICT');
    return { id: existing.id, decision: 'reuse_existing', snapshotChecked: supplied };
  }
  if (collision) reject('TARGET_ID_CONFLICT');
  return { id, decision: 'new_candidate', snapshotChecked: supplied };
}

function mapClinicalRecord(record, records, options = {}) {
  const { inspectRecord, mapPatientRecord, mapCatalogRecord, validDate, timestampNanos } = require('./rehearsal.cjs');
  try {
    const inspection = inspectRecord(record);
    if (inspection.status === 'rejected') return inspection;
    if (!['medical_history', 'medical_documents'].includes(inspection.category)) reject('NOT_A_CLINICAL_RECORD');
    if (!Array.isArray(records) || records.length > 10000) reject('INVALID_BATCH');
    if (records.filter(item => item.source === record.source && item.path === record.path).length !== 1) reject('DUPLICATE_SOURCE');
    const data = record.data;
    const blockers = new Set(['CLINICAL_CUTOVER_PENDING', 'CLINICAL_SCOPE_REVIEW', 'CLINICAL_SCHEMA_RELEASE_PENDING']);
    const dependency = (path, mapper, snapshot) => {
      const matches = records.filter(item => item.source === 'firestore' && item.path === path);
      if (matches.length !== 1) reject('MISSING_REFERENCE');
      const result = mapper(matches[0], records, snapshot);
      if (result.status !== 'mapped') reject('MISSING_REFERENCE');
      for (const reason of result.blockers || []) blockers.add(reason);
      for (const field of result.coverage.fields) if (field.status === 'blocked') blockers.add('CLINICAL_DEPENDENCY_BLOCKED');
      if (!result.targetSnapshotChecked) blockers.add('CLINICAL_DEPENDENCY_IDENTITY_UNCHECKED');
      return result;
    };
    const patient = dependency(record.path.split('/').slice(0, 2).join('/'), mapPatientRecord, options.patientTargetSnapshot);
    let doctorId = null;
    if (data.doctorId !== undefined && data.doctorId !== null) {
      if (typeof data.doctorId !== 'string' || !data.doctorId || data.doctorId.includes('/')) reject('MISSING_REFERENCE');
      doctorId = dependency(`doctors/${data.doctorId}`, mapCatalogRecord, options.targetSnapshot).rows.doctor.id;
    } else blockers.add('CLINICAL_DOCTOR_MISSING');
    const history = inspection.category === 'medical_history';
    const row = { legacyId: record.path, patientId: patient.rows.patient.id, doctorId };
    const fields = { doctorId: 'doctorId', createdAt: 'createdAt', updatedAt: 'updatedAt', details: 'details', ...(history ? { date: 'legacyDate', diagnosis: 'diagnosis', notes: 'notes' } : { name: 'name', title: 'title', category: 'category', url: 'legacyUrl', storagePath: 'storagePath', visibleToPatient: 'visibleToPatient', contentType: 'contentType', size: 'sizeBytes' }) };
    for (const [source, target] of Object.entries(fields)) {
      if (source === 'doctorId') continue;
      const value = data[source] ?? null;
      if (value !== null) {
        if (source.endsWith('At')) { if (timestampNanos(value) % 1000n) blockers.add('TARGET_TIMESTAMP_PRECISION_LOSS'); }
        else if (source === 'visibleToPatient') { if (typeof value !== 'boolean') reject('INVALID_CLINICAL_FIELD'); }
        else if (source === 'size') { if (!Number.isInteger(value) || value < 0 || value > 2147483647) reject('INVALID_CLINICAL_FIELD'); }
        else {
          text(value, ['notes', 'diagnosis', 'details'].includes(source) ? 100000 : 4000);
          if (source === 'date' && !validDate(value)) reject('INVALID_CLINICAL_FIELD');
          if (source === 'url' && value) {
            const url = new URL(value);
            if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) reject('INVALID_CLINICAL_FIELD');
          }
          if (source === 'storagePath' && value && (/^[\/]|[\\\x00-\x1f\x7f]|:/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..'))) reject('INVALID_CLINICAL_FIELD');
          if (source === 'contentType' && value && !/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(value)) reject('INVALID_CLINICAL_FIELD');
        }
      }
      row[target] = value;
    }
    for (const field of ['createdAt', 'updatedAt']) if (row[field] === null) blockers.add(field === 'createdAt' ? 'SOURCE_CREATED_AT_MISSING' : 'SOURCE_UPDATED_AT_MISSING');
    if (!history) {
      blockers.add('DOCUMENT_STORAGE_VERIFICATION_PENDING');
      if (row.visibleToPatient === null) blockers.add('DOCUMENT_VISIBILITY_REVIEW');
      if (row.legacyUrl) blockers.add('DOCUMENT_LEGACY_URL_REVIEW');
    }
    const identity = clinicalIdentity(options.clinicalTargetSnapshot, inspection.category, record.path, row);
    row.id = identity.id;
    if (!identity.snapshotChecked) blockers.add('CLINICAL_TARGET_IDENTITY_PENDING');
    const type = history ? 'LegacyMedicalHistory' : 'LegacyMedicalDocument';
    const coverage = Object.keys(data).sort().map(source => ({ source, target: `${type}.${fields[source]}`, status: 'mapped' }));
    return { status: 'mapped', readyForApply: false, identityDecision: identity.decision, targetSnapshotChecked: identity.snapshotChecked, rows: { [history ? 'legacyMedicalHistory' : 'legacyMedicalDocument']: row }, blockers: [...blockers].sort(), coverage: { fields: coverage, mapped: coverage.length, blocked: 0 }, source: structuredClone(record) };
  } catch (error) { return { status: 'rejected', reason: error.migrationCode || 'INVALID_CLINICAL_RECORD' }; }
}
module.exports = { mapClinicalRecord };
