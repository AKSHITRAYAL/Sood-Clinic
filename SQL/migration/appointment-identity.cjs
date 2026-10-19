const { canonicalUuid, legacyUuid } = require('./catalog-identity.cjs');
const reject = code => { throw Object.assign(new Error(code), { migrationCode: code }); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);

function appointmentIdentity(snapshot) {
  const supplied = snapshot !== undefined;
  if (supplied && (!plain(snapshot) || snapshot.complete !== true || Reflect.ownKeys(snapshot).some(key => !['complete', 'appointments', 'events'].includes(key)) || !Array.isArray(snapshot.appointments) || !Array.isArray(snapshot.events) || snapshot.appointments.length + snapshot.events.length > 10000)) reject('INVALID_TARGET_SNAPSHOT');
  const indexes = {};
  for (const kind of ['appointment', 'appointment_event']) {
    const rows = supplied ? snapshot[kind === 'appointment' ? 'appointments' : 'events'] : [];
    const index = { ids: new Map(), legacyIds: new Map(), references: new Map() };
    const relations = kind === 'appointment' ? ['patientId', 'doctorId', 'branchId', 'serviceId'] : ['appointmentId'];
    const allowed = ['id', 'legacyId', ...relations, ...(kind === 'appointment' ? ['reference'] : [])];
    for (const row of rows) {
      if (!plain(row) || Reflect.ownKeys(row).some(key => !allowed.includes(key)) || !(row.legacyId === null || text(row.legacyId, 512)) || (kind === 'appointment' && !text(row.reference, 128)) || (kind === 'appointment_event' && row.legacyId !== null && !/^appointments\/[^/]+\/events\/[^/]+$/.test(row.legacyId))) reject('INVALID_TARGET_SNAPSHOT');
      const value = { id: canonicalUuid(row.id), legacyId: row.legacyId, ...(kind === 'appointment' ? { reference: row.reference } : {}) };
      for (const relation of relations) value[relation] = relation === 'patientId' && row[relation] === null ? null : canonicalUuid(row[relation]);
      if (index.ids.has(value.id) || (value.legacyId !== null && index.legacyIds.has(value.legacyId)) || (kind === 'appointment' && index.references.has(value.reference))) reject('INVALID_TARGET_SNAPSHOT');
      index.ids.set(value.id, value);
      if (value.legacyId !== null) index.legacyIds.set(value.legacyId, value);
      if (kind === 'appointment') index.references.set(value.reference, value.id);
    }
    indexes[kind] = index;
  }
  for (const row of indexes.appointment_event.ids.values()) if (!indexes.appointment.ids.has(row.appointmentId)) reject('INVALID_TARGET_SNAPSHOT');
  return (kind, legacyId, candidate) => {
    const index = indexes[kind];
    if (!index) reject('INVALID_TARGET_SNAPSHOT');
    const existing = index.legacyIds.get(legacyId);
    if (kind === 'appointment') {
      if ((index.references.has(candidate.reference) && index.references.get(candidate.reference) !== existing?.id) || (existing && existing.reference !== candidate.reference)) reject('TARGET_UNIQUE_CONFLICT');
    }
    if (existing) {
      const relations = kind === 'appointment' ? ['patientId', 'doctorId', 'branchId', 'serviceId'] : ['appointmentId'];
      for (const field of relations) {
        if (field === 'patientId' && candidate[field] === null) {
          if (existing[field] !== null) reject('TARGET_RELATIONSHIP_CONFLICT');
          continue;
        }
        if (!candidate[field]) reject('TARGET_RELATIONSHIP_UNRESOLVED');
        if (canonicalUuid(candidate[field]) !== existing[field]) reject('TARGET_RELATIONSHIP_CONFLICT');
      }
      return { id: existing.id, decision: 'reuse_existing', snapshotChecked: supplied };
    }
    const id = legacyUuid(kind, legacyId);
    if (index.ids.has(id)) reject('TARGET_ID_CONFLICT');
    return { id, decision: 'new_candidate', snapshotChecked: supplied };
  };
}
module.exports = { appointmentIdentity };
