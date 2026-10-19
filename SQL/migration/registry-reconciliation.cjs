const { canonicalUuid, legacyUuid } = require('./catalog-identity.cjs');
const { patientIdentity, validUhid } = require('./patient-identity.cjs');
const { TRANSITIONS } = require('../../functions/lib/stateMachine');
const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
const reject = code => { throw Object.assign(new Error(code), { migrationCode: code }); };

function registryIdentity(snapshot, kind, path, candidate) {
  const supplied = snapshot !== undefined;
  if (supplied && (!plain(snapshot) || snapshot.complete !== true || Reflect.ownKeys(snapshot).some(key => !['complete', 'counters', 'requests'].includes(key)) || !Array.isArray(snapshot.counters) || !Array.isArray(snapshot.requests) || snapshot.counters.length + snapshot.requests.length > 10000)) reject('INVALID_TARGET_SNAPSHOT');
  const id = legacyUuid(kind, path); let existing; let collision = false;
  for (const key of ['counters', 'requests']) {
    const ids = new Set(); const legacyIds = new Set();
    for (const row of supplied ? snapshot[key] : []) {
      const allowed = ['id', 'legacyId', ...(key === 'requests' ? ['appointmentId'] : [])];
      if (!plain(row) || Reflect.ownKeys(row).some(field => !allowed.includes(field)) || !(row.legacyId === null || (typeof row.legacyId === 'string' && row.legacyId.length <= 512 && (key === 'counters' ? row.legacyId === 'counters/patientUhid' : /^bookingRequests\/[^/]+$/.test(row.legacyId))))) reject('INVALID_TARGET_SNAPSHOT');
      const value = { id: canonicalUuid(row.id), legacyId: row.legacyId, ...(key === 'requests' ? { appointmentId: canonicalUuid(row.appointmentId) } : {}) };
      if (ids.has(value.id) || (value.legacyId !== null && legacyIds.has(value.legacyId))) reject('INVALID_TARGET_SNAPSHOT');
      ids.add(value.id); if (value.legacyId !== null) legacyIds.add(value.legacyId);
      if (key !== (kind === 'counter' ? 'counters' : 'requests')) continue;
      if (value.id === id) collision = true;
      if (value.legacyId === path) existing = value;
    }
  }
  if (existing) {
    if (kind === 'booking_request' && candidate.appointmentId !== existing.appointmentId) reject('TARGET_RELATIONSHIP_CONFLICT');
    return { id: existing.id, decision: 'reuse_existing', snapshotChecked: supplied };
  }
  if (collision) reject('TARGET_ID_CONFLICT');
  return { id, decision: 'new_candidate', snapshotChecked: supplied };
}

function mapRegistryRecord(record, records, options = {}) {
  const { inspectRecord, mapAppointmentRecord, timestampNanos } = require('./rehearsal.cjs');
  try {
    const inspection = inspectRecord(record);
    if (inspection.status === 'rejected') return inspection;
    if (!['counters', 'booking_requests'].includes(inspection.category)) reject('NOT_A_REGISTRY_RECORD');
    if (!Array.isArray(records) || records.length > 10000) reject('INVALID_BATCH');
    if (records.filter(row => row.source === record.source && row.path === record.path).length !== 1) reject('DUPLICATE_SOURCE');
    const data = record.data; const counter = inspection.category === 'counters';
    const blockers = new Set(['REGISTRY_SCHEMA_RELEASE_PENDING', 'REGISTRY_CONTENT_RECONCILIATION_PENDING']);
    let row; let targets;
    if (counter) {
      if (!Number.isSafeInteger(data.value) || data.value < 0) reject('INVALID_UHID_COUNTER');
      const uhids = new Set(); const paths = new Set(); let sourceMax = 0n;
      for (const patient of records.filter(item => item.source === 'firestore' && /^patients\/[^/]+$/.test(item.path))) {
        if (inspectRecord(patient).status === 'rejected' || !validUhid(patient.data.uhid)) reject('INVALID_PATIENT_UHID');
        if (paths.has(patient.path)) reject('DUPLICATE_PATIENT_SOURCE');
        if (uhids.has(patient.data.uhid)) reject('DUPLICATE_UHID');
        paths.add(patient.path); uhids.add(patient.data.uhid);
        const value = BigInt(patient.data.uhid.slice(3)); if (value > sourceMax) sourceMax = value;
      }
      let targetMax = null;
      if (options.patientTargetSnapshot !== undefined) {
        patientIdentity(options.patientTargetSnapshot);
        targetMax = 0n;
        for (const patient of options.patientTargetSnapshot.patients) {
          const value = BigInt(patient.uhid.slice(3)); if (value > targetMax) targetMax = value;
        }
      } else blockers.add('UHID_TARGET_CENSUS_PENDING');
      row = { legacyId: record.path, sourceValue: String(data.value), observedSourceMax: String(sourceMax), observedTargetMax: targetMax === null ? null : String(targetMax) };
      if (BigInt(data.value) < sourceMax) blockers.add('UHID_COUNTER_BEHIND_SOURCE');
      if (targetMax !== null && BigInt(data.value) < targetMax) blockers.add('UHID_COUNTER_BEHIND_TARGET');
      if (data.value === Number.MAX_SAFE_INTEGER) blockers.add('UHID_SEQUENCE_EXHAUSTED');
      for (const reason of ['UHID_CENSUS_COMPLETENESS_PENDING', 'UHID_IDENTITY_RECONCILIATION_PENDING', 'UHID_ALLOCATOR_CUTOVER_PENDING']) blockers.add(reason);
      targets = { value: 'LegacyUhidCounter.sourceValue', createdAt: 'LegacyUhidCounter.createdAt', updatedAt: 'LegacyUhidCounter.updatedAt' };
    } else {
      if (typeof data.appointmentId !== 'string' || !data.appointmentId || data.appointmentId.includes('/')) reject('MISSING_REFERENCE');
      const matches = records.filter(item => item.source === 'firestore' && item.path === `appointments/${data.appointmentId}`);
      if (matches.length !== 1) reject('MISSING_REFERENCE');
      const appointment = mapAppointmentRecord(matches[0], records, options);
      if (appointment.status !== 'mapped') reject('MISSING_REFERENCE');
      if (data.reference !== appointment.rows.appointment.reference) reject('REQUEST_REFERENCE_CONFLICT');
      const states = new Set([...Object.keys(TRANSITIONS), ...Object.values(TRANSITIONS).flatMap(value => Object.keys(value))]);
      if (!states.has(data.status)) reject('INVALID_REQUEST_STATUS');
      for (const reason of appointment.blockers) blockers.add(reason);
      for (const reason of ['REQUEST_SCOPE_UNVERIFIED', 'REQUEST_REPLAY_DISABLED']) blockers.add(reason);
      const key = record.path.split('/')[1];
      if (!/^[a-zA-Z0-9_-]{16,128}$/.test(key)) blockers.add('REQUEST_KEY_FORMAT_REVIEW');
      if (data.status !== appointment.rows.appointment.status) blockers.add('REQUEST_STATUS_SNAPSHOT_REVIEW');
      row = { legacyId: record.path, legacyRequestKey: key, appointmentId: appointment.rows.appointment.id, reference: data.reference, status: data.status };
      targets = { appointmentId: 'LegacyBookingRequest.appointmentId', reference: 'LegacyBookingRequest.reference', status: 'LegacyBookingRequest.status', createdAt: 'LegacyBookingRequest.createdAt', updatedAt: 'LegacyBookingRequest.updatedAt' };
    }
    for (const field of ['createdAt', 'updatedAt']) {
      row[field] = data[field] ?? null;
      if (row[field] !== null) { if (timestampNanos(row[field]) % 1000n) blockers.add('TARGET_TIMESTAMP_PRECISION_LOSS'); }
      else blockers.add(field === 'createdAt' ? 'SOURCE_CREATED_AT_MISSING' : 'SOURCE_UPDATED_AT_MISSING');
    }
    const identity = registryIdentity(options.registryTargetSnapshot, counter ? 'counter' : 'booking_request', record.path, row);
    row.id = identity.id;
    if (!identity.snapshotChecked) blockers.add('REGISTRY_TARGET_IDENTITY_PENDING');
    const fields = Object.keys(data).sort().map(source => ({ source, target: targets[source], status: 'mapped' }));
    return { status: 'mapped', readyForApply: false, identityDecision: identity.decision, targetSnapshotChecked: identity.snapshotChecked, rows: { [counter ? 'legacyUhidCounter' : 'legacyBookingRequest']: row }, blockers: [...blockers].sort(), coverage: { fields, mapped: fields.length, blocked: 0 }, source: structuredClone(record) };
  } catch (error) { return { status: 'rejected', reason: error.migrationCode || 'INVALID_REGISTRY_RECORD' }; }
}
module.exports = { mapRegistryRecord };
