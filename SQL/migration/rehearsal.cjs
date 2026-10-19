const { createHash } = require('node:crypto');
const { manifest } = require('./manifest.cjs');
const { istInstant } = require('../../functions/lib/ist');
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const failure = reason => ({ status: 'rejected', reason });

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try { istInstant(value); return true; } catch { return false; }
}
function validTimestamp(value) {
  if (plain(value)) return Object.keys(value).length === 2 && Number.isSafeInteger(value.seconds) && value.seconds >= -62135596800 && value.seconds <= 253402300799 && Number.isInteger(value.nanoseconds) && value.nanoseconds >= 0 && value.nanoseconds < 1e9;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?Z$/.test(value)) return false;
  return validDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}
function paise(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) throw new Error('INVALID_MONEY');
  return value;
}
function legacyUuid(kind, legacyId) {
  if (!['branch', 'department', 'doctor', 'patient', 'appointment', 'appointment_event'].includes(kind) || typeof legacyId !== 'string' || !legacyId || legacyId.length > 512) throw new Error('INVALID_LEGACY_ID');
  // Version 8 application UUID; fixed project/entity namespaces, never contact data.
  const bytes = createHash('sha256').update(JSON.stringify(['sood-clinic-migration-v1', kind, legacyId])).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 128;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function matches(spec, record) {
  if (spec.source !== record.source) return false;
  const expected = spec.path.split('/');
  const actual = record.path.split('/');
  return actual.length === expected.length && expected.every((part, index) => /^\{\w+\}$/.test(part) || part === actual[index]);
}
function checkFields(value, fields, prefix = '', budget = { nodes: 0 }, depth = 0) {
  if (++budget.nodes > 4000 || depth > 12) return 'RECORD_TOO_COMPLEX';
  if (Array.isArray(value)) {
    if (value.length > 1000 || !fields.some(field => field === `${prefix}[]` || field.startsWith(`${prefix}[].`))) return 'INVALID_SHAPE';
    for (const entry of value) {
      const problem = checkFields(entry, fields, `${prefix}[]`, budget, depth + 1);
      if (problem) return problem;
    }
    return null;
  }
  if (plain(value)) {
    if (Reflect.ownKeys(value).some(key => typeof key !== 'string')) return 'INVALID_SHAPE';
    if (prefix && !fields.some(field => field.startsWith(`${prefix}.`))) return 'INVALID_SHAPE';
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value))) {
      if (!Object.hasOwn(descriptor, 'value') || /[.\[\]\/]/.test(key)) return 'INVALID_SHAPE';
      const path = prefix ? `${prefix}.${key}` : key;
      if (!fields.some(field => field === path || field.startsWith(`${path}.`) || field.startsWith(`${path}[]`))) return 'UNKNOWN_FIELD';
      const problem = checkFields(descriptor.value, fields, path, budget, depth + 1);
      if (problem) return problem;
    }
    return null;
  }
  if (!fields.includes(prefix)) return 'INVALID_SHAPE';
  if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return null;
  return 'INVALID_SHAPE';
}
function inspectRecord(record) {
  try {
    if (!plain(record) || Object.keys(record).some(key => !['source', 'path', 'data'].includes(key)) || typeof record.path !== 'string' || record.path.length > 1200 || record.path.split('/').some(part => !part || part === '.' || part === '..') || !plain(record.data)) return failure('INVALID_RECORD');
    const category = Object.keys(manifest).find(key => matches(manifest[key], record));
    if (!category) return failure('UNKNOWN_SOURCE');
    const spec = manifest[category];
    const reason = checkFields(record.data, spec.fields);
    return reason ? { category, disposition: spec.disposition, ...failure(reason) } : { category, disposition: spec.disposition, status: 'recognized' };
  } catch { return failure('INVALID_RECORD'); }
}

function mapCatalogRecord(record, records) {
  const inspection = inspectRecord(record);
  if (inspection.status === 'rejected') return inspection;
  if (inspection.disposition !== 'catalog_candidate') return { ...inspection, status: 'deferred', reason: 'MODULE_NOT_READY' };
  const id = record.path.split('/')[1];
  const data = record.data;
  const required = (value, max = 160) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
  const same = records.filter(row => row.source === record.source && row.path === record.path);
  if (same.length !== 1) return failure('DUPLICATE_SOURCE');
  if (!required(data.name) || typeof data.active !== 'boolean' || !validTimestamp(data.updatedAt) || (data.createdAt !== undefined && !validTimestamp(data.createdAt))) return failure('REQUIRED_FIELD');
  const reference = (collection, legacyId) => {
    const rows = records.filter(row => row.source === 'firestore' && row.path === `${collection}/${legacyId}`);
    return rows.length === 1 && mapCatalogRecord(rows[0], records).status === 'mapped' ? rows[0] : null;
  };
  const uniqueField = field => records.filter(row => row.source === 'firestore' && row.path.startsWith(`${record.path.split('/')[0]}/`) && row.data?.[field] === data[field]).length === 1;
  let rows;
  if (inspection.category === 'branches') {
    if (!required(data.code, 40) || data.timezone !== 'Asia/Kolkata' || !plain(data.address) || !Object.values(data.address).every(value => typeof value === 'string') || !required(data.address.line1)) return failure('REQUIRED_FIELD');
    if (!uniqueField('code')) return failure('DUPLICATE_CODE');
    rows = { branch: { id: legacyUuid('branch', id), legacyId: id, name: data.name, code: data.code, timezone: data.timezone, active: data.active, address: ['line1', 'line2', 'city', 'state', 'postalCode', 'country'].map(key => data.address[key]).filter(Boolean).join(', '), updatedAt: data.updatedAt } };
  } else if (inspection.category === 'departments') {
    if (!reference('branches', data.branchId)) return failure('MISSING_REFERENCE');
    if (!required(data.code, 40) || typeof data.publicBookingEnabled !== 'boolean' || !Number.isInteger(data.sortOrder) || data.sortOrder < 0 || data.sortOrder > 9999) return failure('REQUIRED_FIELD');
    if (!uniqueField('code')) return failure('DUPLICATE_CODE');
    rows = { department: { id: legacyUuid('department', id), legacyId: id, branchId: legacyUuid('branch', data.branchId), name: data.name, code: data.code, active: data.active, publicBookingEnabled: data.publicBookingEnabled, sortOrder: data.sortOrder, updatedAt: data.updatedAt } };
  } else {
    if (!reference('branches', data.branchId) || !Array.isArray(data.departmentIds) || data.departmentIds.length < 1 || data.departmentIds.length > 12 || data.departmentIds.some(departmentId => reference('departments', departmentId)?.data.branchId !== data.branchId)) return failure('MISSING_REFERENCE');
    if (!required(data.registrationNumber) || typeof data.bookingEnabled !== 'boolean' || (data.qualification !== undefined && typeof data.qualification !== 'string')) return failure('REQUIRED_FIELD');
    if (!uniqueField('registrationNumber') || new Set(data.departmentIds).size !== data.departmentIds.length) return failure('DUPLICATE_CODE');
    rows = {
      doctor: { id: legacyUuid('doctor', id), legacyId: id, branchId: legacyUuid('branch', data.branchId), name: data.name, qualification: data.qualification ?? null, registrationNumber: data.registrationNumber, bio: data.bio ?? null, photoPath: data.photoPath ?? null, active: data.active, bookingEnabled: data.bookingEnabled, updatedAt: data.updatedAt },
      doctorDepartments: data.departmentIds.map(departmentId => ({ doctorId: legacyUuid('doctor', id), departmentId: legacyUuid('department', departmentId) })),
    };
  }
  // Candidate projection only. Keep the complete source privately in memory;
  // unmapped provenance/address/description/schedule fields still block apply.
  return { status: 'mapped', readyForApply: false, rows, source: structuredClone(record) };
}

function rehearse(records, { pageSize = 100 } = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('INVALID_PAGE_SIZE');
  if (!Array.isArray(records) || records.length > 10000) throw new Error('INVALID_BATCH');
  const report = { mode: 'dry_run', total: records.length, mapped: 0, deferred: 0, excluded: 0, rejected: 0, readyForApply: 0, writes: 0, counts: {}, reasons: {} };
  // shortcut: catalog lookups scan this bounded in-memory batch; index references
  // before adding an actual export/checkpoint reader in the next migration step.
  for (let offset = 0; offset < records.length; offset += pageSize) {
    for (const record of records.slice(offset, offset + pageSize)) {
      const inspection = inspectRecord(record);
      const category = inspection.category || 'unknown';
      report.counts[category] = (report.counts[category] || 0) + 1;
      let result = inspection;
      if (inspection.status !== 'rejected') {
        if (inspection.disposition === 'catalog_candidate') result = mapCatalogRecord(record, records);
        else result = { status: inspection.disposition === 'deferred' ? 'deferred' : 'excluded', reason: inspection.disposition === 'deferred' ? 'MODULE_NOT_READY' : 'NOT_A_MIGRATION_SOURCE' };
      }
      report[result.status === 'mapped' ? 'mapped' : result.status === 'deferred' ? 'deferred' : result.status === 'excluded' ? 'excluded' : 'rejected'] += 1;
      if (result.reason) report.reasons[result.reason] = (report.reasons[result.reason] || 0) + 1;
    }
  }
  report.counts = Object.fromEntries(Object.entries(report.counts).sort());
  report.reasons = Object.fromEntries(Object.entries(report.reasons).sort());
  return report;
}
module.exports = { manifest, inspectRecord, mapCatalogRecord, legacyUuid, validDate, validTimestamp, paise, rehearse };
