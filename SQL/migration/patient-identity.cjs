const { canonicalUuid, legacyUuid } = require('./catalog-identity.cjs');
const { isUhid } = require('../../functions/lib/patientRegistry');
const reject = code => { throw Object.assign(new Error(code), { migrationCode: code }); };
const validUhid = value => typeof value === 'string' && value.length <= 40 && isUhid(value) && !/^SC-0+$/.test(value) && `SC-${BigInt(value.slice(3)).toString().padStart(6, '0')}` === value;

function patientIdentity(snapshot) {
  const supplied = snapshot !== undefined;
  const plain = value => value && Object.getPrototypeOf(value) === Object.prototype;
  if (supplied && (!plain(snapshot) || snapshot.complete !== true || Reflect.ownKeys(snapshot).some(key => !['complete', 'patients'].includes(key)) || !Array.isArray(snapshot.patients) || snapshot.patients.length > 10000)) reject('INVALID_TARGET_SNAPSHOT');
  const ids = new Map(); const legacyIds = new Map(); const uhids = new Map();
  for (const row of supplied ? snapshot.patients : []) {
    if (!plain(row) || Reflect.ownKeys(row).some(key => !['id', 'legacyId', 'uhid'].includes(key)) || !Object.hasOwn(row, 'legacyId') || !(row.legacyId === null || (typeof row.legacyId === 'string' && row.legacyId.length > 0 && row.legacyId.length <= 512)) || !validUhid(row.uhid)) reject('INVALID_TARGET_SNAPSHOT');
    const id = canonicalUuid(row.id);
    if (ids.has(id) || (row.legacyId !== null && legacyIds.has(row.legacyId)) || uhids.has(row.uhid)) reject('INVALID_TARGET_SNAPSHOT');
    const metadata = { id, uhid: row.uhid };
    ids.set(id, metadata); uhids.set(row.uhid, metadata);
    if (row.legacyId !== null) legacyIds.set(row.legacyId, metadata);
  }
  return (legacyId, uhid) => {
    const existing = legacyIds.get(legacyId);
    if (uhids.has(uhid) && uhids.get(uhid).id !== existing?.id) reject('TARGET_UNIQUE_CONFLICT');
    if (existing && existing.uhid !== uhid) reject('TARGET_UHID_CHANGE');
    if (existing) return { id: existing.id, decision: 'reuse_existing', snapshotChecked: supplied };
    const id = legacyUuid('patient', legacyId);
    if (ids.has(id)) reject('TARGET_ID_CONFLICT');
    return { id, decision: 'new_candidate', snapshotChecked: supplied };
  };
}
module.exports = { patientIdentity, validUhid };
