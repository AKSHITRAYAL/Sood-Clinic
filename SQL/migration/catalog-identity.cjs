const { createHash } = require('node:crypto');
const kinds = { branch: ['branches', 'code'], department: ['departments', 'code'], doctor: ['doctors', 'registrationNumber'] };
const reject = code => { throw Object.assign(new Error(code), { migrationCode: code }); };
function canonicalUuid(value) {
  if (typeof value !== 'string' || !/^(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(value)) reject('INVALID_TARGET_SNAPSHOT');
  const hex = value.replaceAll('-', '').toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function legacyUuid(kind, legacyId) {
  if (![...Object.keys(kinds), 'patient', 'service', 'appointment', 'appointment_event', 'schedule_window', 'schedule_exception', 'exception_window', 'medical_history', 'medical_documents', 'feedback', 'audit', 'counter', 'booking_request'].includes(kind) || typeof legacyId !== 'string' || !legacyId || legacyId.length > 512) throw new Error('INVALID_LEGACY_ID');
  // Version 8 application UUID; fixed project/entity namespaces, never contact data.
  const bytes = createHash('sha256').update(JSON.stringify(['sood-clinic-migration-v1', kind, legacyId])).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 128;
  bytes[8] = (bytes[8] & 63) | 128;
  return canonicalUuid(bytes.toString('hex'));
}

function catalogIdentity(snapshot) {
  const indexes = {};
  const supplied = snapshot !== undefined;
  const plain = value => value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
  const text = value => typeof value === 'string' && value.length > 0 && value.length <= 512;
  if (supplied && (!plain(snapshot) || snapshot.complete !== true || Reflect.ownKeys(snapshot).some(key => !['complete', 'branches', 'departments', 'doctors'].includes(key)))) reject('INVALID_TARGET_SNAPSHOT');
  let total = 0;
  for (const [kind, [collection, unique]] of Object.entries(kinds)) {
    const rows = supplied ? snapshot[collection] : [];
    if (!Array.isArray(rows) || (total += rows.length) > 10000) reject('INVALID_TARGET_SNAPSHOT');
    const index = { ids: new Map(), legacyIds: new Map(), unique: new Map() };
    for (const row of rows) {
      const allowed = ['id', 'legacyId', unique, ...(kind === 'branch' ? [] : ['branchId'])];
      if (!plain(row) || Reflect.ownKeys(row).some(key => !allowed.includes(key)) || !Object.hasOwn(row, 'legacyId') || !(row.legacyId === null || text(row.legacyId)) || !text(row[unique])) reject('INVALID_TARGET_SNAPSHOT');
      const id = canonicalUuid(row.id);
      const metadata = { id, legacyId: row.legacyId, unique: row[unique], ...(kind === 'branch' ? {} : { branchId: canonicalUuid(row.branchId) }) };
      if (index.ids.has(id) || (row.legacyId !== null && index.legacyIds.has(row.legacyId)) || index.unique.has(row[unique])) reject('INVALID_TARGET_SNAPSHOT');
      index.ids.set(id, metadata);
      if (row.legacyId !== null) index.legacyIds.set(row.legacyId, metadata);
      index.unique.set(row[unique], metadata);
    }
    indexes[kind] = index;
  }
  for (const kind of ['department', 'doctor']) {
    for (const row of indexes[kind].ids.values()) if (!indexes.branch.ids.has(row.branchId)) reject('INVALID_TARGET_SNAPSHOT');
  }
  return (kind, legacyId, uniqueValue) => {
    const index = indexes[kind];
    if (!index) reject('INVALID_TARGET_SNAPSHOT');
    const existing = index.legacyIds.get(legacyId);
    const sameUnique = index.unique.get(uniqueValue);
    if (sameUnique && sameUnique.id !== existing?.id) reject('TARGET_UNIQUE_CONFLICT');
    if (existing) return { ...existing, decision: 'reuse_existing', snapshotChecked: supplied };
    const id = legacyUuid(kind, legacyId);
    if (index.ids.has(id)) reject('TARGET_ID_CONFLICT');
    return { id, decision: 'new_candidate', snapshotChecked: supplied };
  };
}
module.exports = { legacyUuid, catalogIdentity, canonicalUuid };
