const { canonicalUuid, legacyUuid } = require('./catalog-identity.cjs');
const reject = code => { throw Object.assign(new Error(code), { migrationCode: code }); };
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);

function serviceIdentity(snapshot) {
  const supplied = snapshot !== undefined;
  if (supplied && (!plain(snapshot) || snapshot.complete !== true || Reflect.ownKeys(snapshot).some(key => !['complete', 'services'].includes(key)) || !Array.isArray(snapshot.services) || snapshot.services.length > 10000)) reject('INVALID_TARGET_SNAPSHOT');
  const ids = new Set(); const legacyIds = new Map(); const codes = new Map();
  for (const row of supplied ? snapshot.services : []) {
    if (!plain(row) || Reflect.ownKeys(row).some(key => !['id', 'legacyId', 'code'].includes(key)) || !(row.legacyId === null || text(row.legacyId, 512)) || !text(row.code, 160)) reject('INVALID_TARGET_SNAPSHOT');
    const id = canonicalUuid(row.id);
    if (ids.has(id) || codes.has(row.code) || (row.legacyId !== null && legacyIds.has(row.legacyId))) reject('INVALID_TARGET_SNAPSHOT');
    ids.add(id); codes.set(row.code, id);
    if (row.legacyId !== null) legacyIds.set(row.legacyId, id);
  }
  return code => {
    const existing = legacyIds.get(code);
    if (codes.has(code) && codes.get(code) !== existing) reject('TARGET_UNIQUE_CONFLICT');
    if (existing) return { id: existing, decision: 'reuse_existing', snapshotChecked: supplied };
    const id = legacyUuid('service', code);
    if (ids.has(id)) reject('TARGET_ID_CONFLICT');
    return { id, decision: 'new_candidate', snapshotChecked: supplied };
  };
}

function mapBookingConfig(record, records, snapshot) {
  // Lazy import shares validation with the rehearsal without a second parser.
  const { inspectRecord, timestampNanos, paise } = require('./rehearsal.cjs');
  try {
    const inspection = inspectRecord(record);
    if (inspection.status === 'rejected') return inspection;
    if (inspection.category !== 'public_config') reject('NOT_BOOKING_CONFIG');
    if (!Array.isArray(records) || records.length > 10000) reject('INVALID_BATCH');
    if (records.filter(row => row.source === record.source && row.path === record.path).length !== 1) reject('DUPLICATE_SOURCE');
    const resolve = serviceIdentity(snapshot);
    const data = record.data; const coverage = []; const blockers = new Set(['CONFIG_CUTOVER_PENDING', 'DOCTOR_SERVICE_ASSIGNMENT_REVIEW']);
    const mapped = (source, target) => coverage.push({ source, target, status: 'mapped' });
    const missing = (source, reason) => { blockers.add(reason); coverage.push({ source, reason, status: 'blocked' }); };
    const integer = (field, min, max) => {
      if (!Object.hasOwn(data, field)) { blockers.add('CONFIG_FIELD_MISSING'); return null; }
      if (!Number.isInteger(data[field]) || data[field] < min || data[field] > max) reject('INVALID_CONFIG_FIELD');
      mapped(field, `ClinicSettings.${field === 'patientCancellationCutoffHours' ? 'cancelCutoffMinutes' : field}`);
      return data[field];
    };
    const instant = field => {
      if (!Object.hasOwn(data, field)) { blockers.add(field === 'updatedAt' ? 'SOURCE_UPDATED_AT_MISSING' : 'SOURCE_CREATED_AT_MISSING'); return null; }
      if (timestampNanos(data[field]) % 1000n) missing(field, 'TARGET_TIMESTAMP_PRECISION_LOSS');
      else mapped(field, `ClinicSettings.${field}/Service.${field === 'updatedAt' ? field : 'legacyCreatedAt'}`);
      return structuredClone(data[field]);
    };
    const hours = integer('patientCancellationCutoffHours', 0, 168);
    const settings = { id: 'primary', bookingWindowDays: integer('bookingWindowDays', 1, 90), leadMinutes: integer('leadMinutes', 0, 1440), slotMinutes: integer('slotMinutes', 5, 240), intervalMinutes: integer('intervalMinutes', 5, 240), bufferBeforeMinutes: integer('bufferBeforeMinutes', 0, 120), bufferAfterMinutes: integer('bufferAfterMinutes', 0, 120), cancelCutoffMinutes: hours === null ? null : hours * 60, autoConfirm: null, createdAt: instant('createdAt'), updatedAt: instant('updatedAt'), legacyUpdatedBy: data.updatedBy ?? null };
    if (Object.hasOwn(data, 'autoConfirm')) {
      if (typeof data.autoConfirm !== 'boolean') reject('INVALID_CONFIG_FIELD');
      settings.autoConfirm = data.autoConfirm; mapped('autoConfirm', 'ClinicSettings.autoConfirm');
    } else blockers.add('CONFIG_FIELD_MISSING');
    if (Object.hasOwn(data, 'updatedBy')) {
      if (!(data.updatedBy === null || text(data.updatedBy, 128))) reject('INVALID_CONFIG_FIELD');
      mapped('updatedBy', 'ClinicSettings.legacyUpdatedBy');
    }
    if (Object.hasOwn(data, 'timezone')) {
      if (data.timezone !== 'Asia/Kolkata') reject('INVALID_CONFIG_FIELD');
      missing('timezone', 'SQL_CONTACT_AUTHORITY_REVIEW');
    }
    for (const field of ['name', 'phone', 'email', 'address']) if (Object.hasOwn(data, field)) {
      if (typeof data[field] !== 'string' || data[field].length > 4000 || data[field].includes('\0')) reject('INVALID_CONFIG_FIELD');
      missing(field, 'SQL_CONTACT_AUTHORITY_REVIEW');
    }
    const services = []; const identities = []; const codes = new Set();
    if (!Object.hasOwn(data, 'visitTypes')) blockers.add('CONFIG_VISIT_TYPES_MISSING');
    else {
      if (!Array.isArray(data.visitTypes) || data.visitTypes.length > 12) reject('INVALID_VISIT_TYPES');
      if (!data.visitTypes.length) blockers.add('LEGACY_VISIT_TYPES_EMPTY_REVIEW');
      mapped('visitTypes[]', 'Service.legacySortOrder');
      for (const [order, item] of data.visitTypes.entries()) {
        if (!plain(item) || !text(item.id, 120) || !text(item.label, 100) || !Number.isInteger(item.minutes) || item.minutes < 5 || item.minutes > 240) reject('INVALID_VISIT_TYPE');
        if (codes.has(item.id)) reject('DUPLICATE_SERVICE_CODE');
        codes.add(item.id);
        if (item.mode !== undefined && !['in_person', 'video'].includes(item.mode)) reject('INVALID_VISIT_TYPE');
        if (item.active !== undefined && typeof item.active !== 'boolean') reject('INVALID_VISIT_TYPE');
        if (item.feePaise !== undefined && item.feePaise !== null) paise(item.feePaise);
        const identity = resolve(item.id); identities.push(identity);
        services.push({ id: identity.id, legacyId: item.id, code: item.id, name: item.label, durationMinutes: item.minutes, consultationMode: item.mode ?? null, active: item.active ?? null, feePaise: item.feePaise ?? null, legacySortOrder: order, legacyCreatedAt: settings.createdAt, updatedAt: settings.updatedAt });
        for (const [field, target] of Object.entries({ id: 'legacyId/code', label: 'name', minutes: 'durationMinutes', mode: 'consultationMode', active: 'active', feePaise: 'feePaise' })) if (Object.hasOwn(item, field)) mapped(`visitTypes[${order}].${field}`, `Service.${target}`);
        if (item.mode === undefined) blockers.add('SERVICE_MODE_MISSING');
        if (item.active === undefined) blockers.add('SERVICE_ACTIVE_MISSING');
        // The SQL per-service buffer is distinct from the legacy global buffers.
        blockers.add('SERVICE_BUFFER_REVIEW');
      }
    }
    if (snapshot === undefined) blockers.add('SERVICE_TARGET_IDENTITY_UNCHECKED');
    return { status: 'mapped', readyForApply: false, targetSnapshotChecked: snapshot !== undefined, identities, rows: { clinicSettings: settings, services }, blockers: [...blockers].sort(), coverage: { fields: coverage, mapped: coverage.filter(field => field.status === 'mapped').length, blocked: coverage.filter(field => field.status === 'blocked').length }, source: structuredClone(record) };
  } catch (error) { return { status: 'rejected', reason: error.migrationCode || 'INVALID_BOOKING_CONFIG' }; }
}
module.exports = { mapBookingConfig };
