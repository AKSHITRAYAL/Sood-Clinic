const { legacyUuid, catalogIdentity } = require('./catalog-identity.cjs');
const { catalogFields } = require('./catalog-fields.cjs');
const { patientIdentity, validUhid } = require('./patient-identity.cjs');
const { mapBookingConfig } = require('./booking-config.cjs');
const { appointmentIdentity } = require('./appointment-identity.cjs');
const { mapScheduleRecord } = require('./hours-mapping.cjs');
const { appointmentFields } = require('./appointment-fields.cjs');
const { prepareMigrationTimestamps } = require('./instant-preservation.cjs');
const { mapClinicalRecord } = require('./clinical-mapping.cjs');
const { mapExperienceRecord } = require('./experience-history.cjs');
const { mapRegistryRecord } = require('./registry-reconciliation.cjs');
const { assessPatientOwnership } = require('./ownership-review.cjs');
const { manifest } = require('./manifest.cjs');
const { istInstant, weekdayIst, istDateKey } = require('../../functions/lib/ist');
const { minutesFor } = require('../../functions/lib/availability');
const { TRANSITIONS } = require('../../functions/lib/stateMachine');
const plain = value => value && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const failure = reason => ({ status: 'rejected', reason });

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try { istInstant(value); return true; } catch { return false; }
}
function validTimestamp(value) {
  if (plain(value)) return Reflect.ownKeys(value).length === 2 && ['seconds', 'nanoseconds'].every(key => Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) || {}, 'value')) && Number.isSafeInteger(value.seconds) && value.seconds >= -62135596800 && value.seconds <= 253402300799 && Number.isInteger(value.nanoseconds) && value.nanoseconds >= 0 && value.nanoseconds < 1e9;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?Z$/.test(value)) return false;
  const millis = Date.parse(value);
  return Number.isFinite(millis) && millis >= -62135596800000 && millis <= 253402300799999 && new Date(millis).toISOString().slice(0, 10) === value.slice(0, 10);
}
function paise(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 2147483647) throw new Error('INVALID_MONEY');
  return value;
}
function timestampNanos(value) {
  if (!validTimestamp(value)) throw new Error('INVALID_TIMESTAMP');
  if (plain(value)) return BigInt(value.seconds) * 1000000000n + BigInt(value.nanoseconds);
  const fraction = /\.(\d+)Z$/.exec(value)?.[1] || '';
  return BigInt(Date.parse(value.replace(/\.\d+Z$/, 'Z'))) * 1000000n + BigInt(fraction.padEnd(9, '0'));
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

function mapCatalogRecord(record, records, targetSnapshot) {
  try { return mapCatalog(record, records, catalogIdentity(targetSnapshot)); }
  catch (error) { return failure(error.migrationCode || 'INVALID_CATALOG_RECORD'); }
}
function mapCatalog(record, records, resolveId) {
  const inspection = inspectRecord(record);
  if (inspection.status === 'rejected') return inspection;
  if (inspection.disposition !== 'catalog_candidate') return { ...inspection, status: 'deferred', reason: 'MODULE_NOT_READY' };
  const id = record.path.split('/')[1];
  const data = record.data;
  const required = (value, max = 160) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
  const same = records.filter(row => row.source === record.source && row.path === record.path);
  if (same.length !== 1) return failure('DUPLICATE_SOURCE');
  if (!required(data.name) || typeof data.active !== 'boolean' || !validTimestamp(data.updatedAt) || (data.createdAt !== undefined && !validTimestamp(data.createdAt))) return failure('REQUIRED_FIELD');
  if (data.updatedBy !== undefined && data.updatedBy !== null && (typeof data.updatedBy !== 'string' || data.updatedBy.length > 128)) return failure('REQUIRED_FIELD');
  const reference = (collection, legacyId) => {
    if (typeof legacyId !== 'string' || !legacyId || legacyId.length > 512) return null;
    const rows = records.filter(row => row.source === 'firestore' && row.path === `${collection}/${legacyId}`);
    if (rows.length !== 1) return null;
    const result = mapCatalog(rows[0], records, resolveId);
    return result.status === 'mapped' ? result : null;
  };
  const uniqueField = field => records.filter(row => row.source === 'firestore' && row.path.startsWith(`${record.path.split('/')[0]}/`) && row.data?.[field] === data[field]).length === 1;
  let rows; let identity;
  if (inspection.category === 'branches') {
    if (!required(data.code, 40) || data.timezone !== 'Asia/Kolkata' || !plain(data.address) || !Object.values(data.address).every(value => typeof value === 'string') || !required(data.address.line1)) return failure('REQUIRED_FIELD');
    if (!uniqueField('code')) return failure('DUPLICATE_CODE');
    identity = resolveId('branch', id, data.code);
    rows = { branch: { id: identity.id, legacyId: id, name: data.name, code: data.code, timezone: data.timezone, active: data.active, address: ['line1', 'line2', 'city', 'state', 'postalCode', 'country'].map(key => data.address[key]).filter(Boolean).join(', '), updatedAt: data.updatedAt, ...(data.createdAt === undefined ? {} : { createdAt: data.createdAt }) } };
    Object.assign(rows.branch, { addressLine1: data.address.line1 ?? null, addressLine2: data.address.line2 ?? null, city: data.address.city ?? null, state: data.address.state ?? null, postalCode: data.address.postalCode ?? null, country: data.address.country ?? null, legacyUpdatedBy: data.updatedBy ?? null });
  } else if (inspection.category === 'departments') {
    const parent = reference('branches', data.branchId);
    if (!parent) return failure('MISSING_REFERENCE');
    if (!required(data.code, 40) || typeof data.publicBookingEnabled !== 'boolean' || !Number.isInteger(data.sortOrder) || data.sortOrder < 0 || data.sortOrder > 9999 || (data.description !== undefined && data.description !== null && typeof data.description !== 'string')) return failure('REQUIRED_FIELD');
    if (!uniqueField('code')) return failure('DUPLICATE_CODE');
    identity = resolveId('department', id, data.code);
    if (identity.branchId && identity.branchId !== parent.rows.branch.id) return failure('TARGET_RELATIONSHIP_CONFLICT');
    rows = { department: { id: identity.id, legacyId: id, branchId: parent.rows.branch.id, name: data.name, code: data.code, active: data.active, publicBookingEnabled: data.publicBookingEnabled, sortOrder: data.sortOrder, updatedAt: data.updatedAt } };
    Object.assign(rows.department, { description: data.description ?? null, createdAt: data.createdAt ?? null, legacyUpdatedBy: data.updatedBy ?? null });
  } else {
    const parent = reference('branches', data.branchId);
    if (!parent || !Array.isArray(data.departmentIds) || data.departmentIds.length < 1 || data.departmentIds.length > 12) return failure('MISSING_REFERENCE');
    const departments = data.departmentIds.map(departmentId => reference('departments', departmentId));
    if (departments.some(department => department?.rows.department.branchId !== parent.rows.branch.id)) return failure('MISSING_REFERENCE');
    if (!required(data.registrationNumber) || typeof data.bookingEnabled !== 'boolean' || ['qualification', 'bio', 'photoPath'].some(field => data[field] !== undefined && data[field] !== null && typeof data[field] !== 'string')) return failure('REQUIRED_FIELD');
    if (!uniqueField('registrationNumber') || new Set(data.departmentIds).size !== data.departmentIds.length) return failure('DUPLICATE_CODE');
    identity = resolveId('doctor', id, data.registrationNumber);
    if (identity.branchId && identity.branchId !== parent.rows.branch.id) return failure('TARGET_RELATIONSHIP_CONFLICT');
    rows = {
      doctor: { id: identity.id, legacyId: id, branchId: parent.rows.branch.id, name: data.name, qualification: data.qualification ?? null, registrationNumber: data.registrationNumber, bio: data.bio ?? null, photoPath: data.photoPath ?? null, active: data.active, bookingEnabled: data.bookingEnabled, updatedAt: data.updatedAt },
      doctorDepartments: departments.map((department, sortOrder) => ({ doctorId: identity.id, departmentId: department.rows.department.id, sortOrder })),
    };
    Object.assign(rows.doctor, { createdAt: data.createdAt ?? null, legacyUpdatedBy: data.updatedBy ?? null });
  }
  // Candidate projection only. Keep the complete source privately in memory;
  // unresolved legacy schedules/precision and release gates still block apply.
  return { status: 'mapped', readyForApply: false, identityDecision: identity.decision, targetSnapshotChecked: identity.snapshotChecked, coverage: catalogFields(inspection.category, data), rows, source: structuredClone(record) };
}

// Assessment only: source precedence is not permission to discard older hours.
function assessSchedule(record, records) {
  try {
    const inspection = inspectRecord(record);
    if (inspection.status === 'rejected') return inspection;
    if (!['schedules', 'exceptions', 'old_schedules', 'doctors'].includes(inspection.category)) return failure('NOT_A_SCHEDULE');
    if (!Array.isArray(records) || records.length > 10000) return failure('INVALID_BATCH');
    if (records.filter(row => row.source === record.source && row.path === record.path).length !== 1) return failure('DUPLICATE_SOURCE');
    const doctorId = inspection.category === 'doctors' ? record.path.split('/')[1] : record.data.doctorId;
    if (typeof doctorId !== 'string' || !doctorId || doctorId.includes('/')) return failure('MISSING_REFERENCE');
    const doctors = records.filter(row => row.source === 'firestore' && row.path === `doctors/${doctorId}`);
    if (doctors.length !== 1 || inspectRecord(doctors[0]).status === 'rejected') return failure('MISSING_REFERENCE');
    const modern = records.filter(row => row.source === 'firestore' && row.path === `doctorSchedules/${doctorId}`);
    const old = records.filter(row => row.source === 'firestore' && row.path === `clinicSchedules/${doctorId}`);
    if (modern.length > 1 || old.length > 1) return failure('DUPLICATE_SOURCE');
    for (const collection of ['doctorSchedules', 'clinicSchedules']) {
      if (records.some(row => row.source === 'firestore' && new RegExp(`^${collection}/[^/]+$`).test(row.path) && row.data?.doctorId === doctorId && row.path !== `${collection}/${doctorId}`)) return failure('SCHEDULE_SOURCE_ID_MISMATCH');
    }
    const blockers = new Set(['SCHEDULE_TARGET_MAPPING_PENDING']);
    const metadata = row => {
      if (inspectRecord(row).status === 'rejected' || (row !== doctors[0] && row.data.doctorId !== doctorId)) throw new Error('INVALID_SCHEDULE_METADATA');
      for (const field of ['createdAt', 'updatedAt']) {
        const value = row.data[field];
        if (value === undefined) continue;
        if (!validTimestamp(value)) throw new Error('INVALID_SCHEDULE_METADATA');
        const nanos = typeof value === 'string' ? Number((/\.(\d+)Z$/.exec(value)?.[1] || '').padEnd(9, '0')) : value.nanoseconds;
        if (nanos % 1000) blockers.add('TARGET_TIMESTAMP_PRECISION_LOSS');
      }
      for (const field of ['createdBy', 'updatedBy', 'reason', 'note']) if (Object.hasOwn(row.data, field)) {
        if (typeof row.data[field] !== 'string') throw new Error('INVALID_SCHEDULE_METADATA');
        blockers.add('SCHEDULE_PRIVATE_METADATA_PENDING');
      }
    };
    const windows = (sessions, weekly, embedded = false) => {
      if (!Array.isArray(sessions) || sessions.length > (weekly ? 14 : 4)) throw new Error('INVALID_SCHEDULE_WINDOWS');
      const values = sessions.map(session => {
        const startMinute = minutesFor(session[embedded ? 'startTime' : 'start']);
        const endMinute = minutesFor(session[embedded ? 'endTime' : 'end']);
        if (!Number.isInteger(startMinute) || !Number.isInteger(endMinute) || startMinute >= endMinute || (weekly && (!Number.isInteger(session.weekday) || session.weekday < 0 || session.weekday > 6))) throw new Error('INVALID_SCHEDULE_WINDOWS');
        if (embedded && Object.hasOwn(session, 'slotMinutes')) {
          if (!Number.isInteger(session.slotMinutes) || session.slotMinutes < 5 || session.slotMinutes > 480) throw new Error('INVALID_SCHEDULE_WINDOWS');
          blockers.add('LEGACY_SLOT_DURATION_REVIEW');
        }
        return { ...(weekly ? { weekday: session.weekday } : {}), startMinute, endMinute };
      }).sort((a, b) => (a.weekday || 0) - (b.weekday || 0) || a.startMinute - b.startMinute);
      if (values.some((value, i) => i > 0 && value.weekday === values[i - 1].weekday && value.startMinute < values[i - 1].endMinute)) throw new Error('INVALID_SCHEDULE_WINDOWS');
      return values;
    };
    metadata(doctors[0]);
    let regular; let authority = 'none';
    if (modern.length) {
      metadata(modern[0]);
      regular = windows(modern[0].data.sessions, true);
      authority = 'doctor_schedule';
    }
    if (Object.hasOwn(doctors[0].data, 'weeklySchedule')) {
      const fallback = windows(doctors[0].data.weeklySchedule, true, true);
      if (regular && JSON.stringify(regular) !== JSON.stringify(fallback)) blockers.add('SCHEDULE_SOURCE_CONFLICT');
      if (!regular) { regular = fallback; authority = 'embedded_doctor'; }
    }
    for (const row of old) {
      metadata(row);
      const legacy = windows(row.data.sessions, true);
      blockers.add('LEGACY_CLINIC_SCHEDULE_REVIEW');
      if (!regular || JSON.stringify(regular) !== JSON.stringify(legacy)) blockers.add('SCHEDULE_SOURCE_CONFLICT');
    }
    if (!regular) blockers.add('MISSING_AUTHORITATIVE_SCHEDULE');
    let projected = regular || [];
    if (inspection.category === 'exceptions') {
      metadata(record);
      const data = record.data;
      if (!validDate(data.dateKey) || !['closed', 'extra', 'replace'].includes(data.type)) return failure('INVALID_SCHEDULE_EXCEPTION');
      if (records.filter(row => row.source === 'firestore' && /^scheduleExceptions\/[^/]+$/.test(row.path) && row.data?.doctorId === doctorId && row.data?.dateKey === data.dateKey).length !== 1) return failure('DUPLICATE_EXCEPTION_DATE');
      projected = windows(data.sessions === undefined && data.type === 'closed' ? [] : data.sessions, false);
      if ((data.type === 'closed' && projected.length) || (data.type !== 'closed' && !projected.length)) return failure('INVALID_SCHEDULE_EXCEPTION');
      if (data.type === 'extra') {
        const combined = [...(regular || []).filter(window => window.weekday === weekdayIst(data.dateKey)), ...projected].sort((a, b) => a.startMinute - b.startMinute);
        if (combined.some((value, i) => i > 0 && value.startMinute < combined[i - 1].endMinute)) return failure('INVALID_SCHEDULE_WINDOWS');
      }
    }
    return { status: 'deferred', reason: 'SCHEDULE_VALIDATED_NOT_MAPPED', readyForApply: false, authority, windows: projected, blockers: [...blockers].sort(), source: structuredClone(record) };
  } catch (error) {
    return failure(['INVALID_SCHEDULE_WINDOWS', 'INVALID_SCHEDULE_METADATA'].includes(error.message) ? error.message : 'INVALID_SCHEDULE_RECORD');
  }
}

function mapPatientRecord(record, records, targetSnapshot) {
  try {
    const inspection = inspectRecord(record);
    if (inspection.status === 'rejected') return inspection;
    if (inspection.category !== 'patients') return failure('NOT_A_PATIENT');
    if (!Array.isArray(records) || records.length > 10000) return failure('INVALID_BATCH');
    if (records.filter(row => row.source === record.source && row.path === record.path).length !== 1) return failure('DUPLICATE_SOURCE');
    const data = record.data;
    const text = (value, max) => typeof value === 'string' && value.length <= max && !value.includes('\0');
    if (!validUhid(data.uhid) || !text(data.displayName, 160) || !data.displayName.trim() || !text(data.phone, 32)) return failure('INVALID_PATIENT_FIELD');
    if (records.filter(row => row.source === 'firestore' && /^patients\/[^/]+$/.test(row.path) && row.data?.uhid === data.uhid).length !== 1) return failure('DUPLICATE_UHID');
    const fields = ['title', 'displayName', 'phone', 'email', 'gender', 'maritalStatus', 'bloodGroup', 'addressLine1', 'city', 'state', 'postalCode', 'emergencyContactName', 'emergencyContactPhone', 'recordSource', 'createdBy', 'updatedBy'];
    const clinical = ['allergies', 'currentMedications', 'healthNotes'];
    const creator = plain(data.createdBy);
    if (creator && (Object.keys(data.createdBy).length !== 2 || !Object.hasOwn(data.createdBy, 'uid') || !Object.hasOwn(data.createdBy, 'role') || !(data.createdBy.uid === null || text(data.createdBy.uid, 128)) || !text(data.createdBy.role, 120) || !data.createdBy.role)) return failure('INVALID_PATIENT_FIELD');
    for (const field of [...fields, ...clinical, 'uid', 'displayNameLower', 'phoneNormalized']) {
      if (field === 'createdBy' && creator) continue;
      if (data[field] !== undefined && data[field] !== null && !text(data[field], clinical.includes(field) ? 2000 : field === 'email' ? 254 : ['uid', 'createdBy', 'updatedBy'].includes(field) ? 128 : field === 'phone' ? 32 : 160)) return failure('INVALID_PATIENT_FIELD');
    }
    if (Object.hasOwn(data, 'linkedUids') && (!Array.isArray(data.linkedUids) || data.linkedUids.some(uid => !text(uid, 128) || !uid) || new Set(data.linkedUids).size !== data.linkedUids.length)) return failure('INVALID_PATIENT_FIELD');
    if (data.dateOfBirth !== undefined && data.dateOfBirth !== null && data.dateOfBirth !== '' && !validDate(data.dateOfBirth)) return failure('INVALID_PATIENT_FIELD');
    if (!validTimestamp(data.updatedAt) || (data.createdAt !== undefined && !validTimestamp(data.createdAt))) return failure('INVALID_PATIENT_TIMESTAMP');
    const id = record.path.split('/')[1];
    const identity = patientIdentity(targetSnapshot)(id, data.uhid);
    const patient = { id: identity.id, legacyId: id, uhid: data.uhid, dateOfBirth: data.dateOfBirth || null, createdAt: data.createdAt ?? null, updatedAt: data.updatedAt };
    const targets = { uhid: 'Patient.uhid', dateOfBirth: 'Patient.dateOfBirth', createdAt: 'Patient.createdAt', updatedAt: 'Patient.updatedAt' };
    for (const field of fields) {
      const target = field === 'recordSource' ? 'legacyRecordSource' : field === 'createdBy' ? 'legacyCreatedBy' : field === 'updatedBy' ? 'legacyUpdatedBy' : field;
      patient[target] = field === 'createdBy' && creator ? null : data[field] ?? null;
      targets[field] = `Patient.${target}`;
    }
    patient.legacyCreatedByUid = creator ? data.createdBy.uid : null;
    patient.legacyCreatedByRole = creator ? data.createdBy.role : null;
    if (creator) targets.createdBy = 'Patient.legacyCreatedByUid/legacyCreatedByRole';
    patient.address = ['addressLine1', 'city', 'state', 'postalCode'].map(field => data[field]).filter(Boolean).join(', ') || null;
    const rows = { patient };
    if (clinical.some(field => Object.hasOwn(data, field))) {
      rows.patientReportedProfile = { patientId: identity.id };
      for (const field of clinical) { rows.patientReportedProfile[field] = data[field] ?? null; targets[field] = `PatientReportedProfile.${field}`; }
    }
    const blockers = new Set(['PATIENT_CUTOVER_PENDING']);
    if (creator) blockers.add('PATIENT_CREATOR_PROVENANCE_REVIEW');
    if (data.createdAt === undefined) blockers.add('SOURCE_CREATED_AT_MISSING');
    const coverage = Object.keys(data).sort().map(source => {
      let reason;
      if (['uid', 'linkedUids'].includes(source)) reason = 'PATIENT_OWNERSHIP_REVIEW';
      else if (['displayNameLower', 'phoneNormalized'].includes(source)) reason = 'PATIENT_SEARCH_REBUILD_REVIEW';
      else if (source === 'dateOfBirth' && data[source] === '') reason = 'EMPTY_DATE_REPRESENTATION_REVIEW';
      else if (['createdAt', 'updatedAt'].includes(source)) {
        const value = data[source];
        const nanos = typeof value === 'string' ? Number((/\.(\d+)Z$/.exec(value)?.[1] || '').padEnd(9, '0')) : value.nanoseconds;
        if (nanos % 1000) reason = 'TARGET_TIMESTAMP_PRECISION_LOSS';
      }
      if (!targets[source] && !reason) reason = 'TARGET_FIELD_MISSING';
      if (reason) blockers.add(reason);
      return reason ? { source, status: 'blocked', reason } : { source, target: targets[source], status: 'mapped' };
    });
    return { status: 'mapped', readyForApply: false, identityDecision: identity.decision, targetSnapshotChecked: identity.snapshotChecked, rows, coverage: { fields: coverage, mapped: coverage.filter(field => field.status === 'mapped').length, blocked: coverage.filter(field => field.status === 'blocked').length }, blockers: [...blockers].sort(), source: structuredClone(record) };
  } catch (error) { return failure(error.migrationCode || 'INVALID_PATIENT_RECORD'); }
}

function mapAppointmentRecord(record, records, options = {}) {
  try {
    const inspection = inspectRecord(record);
    if (inspection.status === 'rejected') return inspection;
    if (!['appointments', 'appointment_events'].includes(inspection.category)) return failure('NOT_AN_APPOINTMENT');
    if (!Array.isArray(records) || records.length > 10000) return failure('INVALID_BATCH');
    if (records.filter(row => row.source === record.source && row.path === record.path).length !== 1) return failure('DUPLICATE_SOURCE');
    const data = record.data;
    const states = new Set([...Object.keys(TRANSITIONS), ...Object.values(TRANSITIONS).flatMap(transitions => Object.keys(transitions))]);
    const text = (value, max = 160) => typeof value === 'string' && value.length <= max && !value.includes('\0');
    const roles = new Set(['public', 'guest', 'patient', 'manager', 'doctor', 'admin', 'system']);
    const blockers = new Set(['APPOINTMENT_CUTOVER_PENDING', 'APPOINTMENT_TARGET_IDENTITY_PENDING']);
    const coverage = []; const targets = {};
    const instant = value => {
      const nanos = timestampNanos(value);
      if (nanos % 1000n) blockers.add('TARGET_TIMESTAMP_PRECISION_LOSS');
      return nanos;
    };
    let rows;
    if (inspection.category === 'appointment_events') {
      const parent = records.filter(row => row.source === 'firestore' && row.path === record.path.split('/').slice(0, 2).join('/'));
      if (parent.length !== 1) return failure('MISSING_REFERENCE');
      const mapped = mapAppointmentRecord(parent[0], records, options);
      if (mapped.status !== 'mapped') return failure('MISSING_REFERENCE');
      for (const reason of mapped.blockers) blockers.add(reason);
      if (!(data.from === null || states.has(data.from)) || !states.has(data.to) || !roles.has(data.byRole) || !(data.byUid === null || text(data.byUid, 128))) return failure('INVALID_APPOINTMENT_EVENT');
      instant(data.at);
      rows = { appointmentEvent: { id: legacyUuid('appointment_event', record.path), appointmentId: mapped.rows.appointment.id, previousStatus: data.from, nextStatus: data.to, actorUid: data.byUid, actorRole: data.byRole, occurredAt: data.at } };
      Object.assign(targets, { from: 'AppointmentEvent.previousStatus', to: 'AppointmentEvent.nextStatus', byUid: 'AppointmentEvent.actorUid', byRole: 'AppointmentEvent.actorRole', at: 'AppointmentEvent.occurredAt' });
      blockers.add('EVENT_ACTION_PROVENANCE_PENDING');
    } else {
      if (!text(data.reference, 128) || !data.reference.trim() || !states.has(data.status) || !['in_person', 'video'].includes(data.visitMode) || !text(data.visitType, 120) || !data.visitType) return failure('INVALID_APPOINTMENT_FIELD');
      if (records.filter(row => row.source === 'firestore' && /^appointments\/[^/]+$/.test(row.path) && row.data?.reference === data.reference).length !== 1) return failure('DUPLICATE_APPOINTMENT_REFERENCE');
      const start = instant(data.startsAt); const end = instant(data.endsAt);
      if (end <= start) return failure('INVALID_APPOINTMENT_INTERVAL');
      const milliseconds = start / 1000000n - (start < 0n && start % 1000000n ? 1n : 0n);
      if (!validDate(data.dateKey) || istDateKey(new Date(Number(milliseconds))) !== data.dateKey) return failure('APPOINTMENT_DATE_MISMATCH');
      const reference = (collection, id, mapper, snapshot) => {
        if (typeof id !== 'string' || !id || id.includes('/')) return null;
        const matches = records.filter(row => row.source === 'firestore' && row.path === `${collection}/${id}`);
        if (matches.length !== 1) return null;
        const result = mapper(matches[0], records, snapshot);
        return result.status === 'mapped' ? result : null;
      };
      const branch = reference('branches', data.branchId, mapCatalogRecord, options.targetSnapshot);
      const department = reference('departments', data.departmentId, mapCatalogRecord, options.targetSnapshot);
      const doctor = reference('doctors', data.doctorId, mapCatalogRecord, options.targetSnapshot);
      // Retain the anonymous writer's explicit NULL, never resolve a person by contact.
      const guest = data.patientId === null && data.source === 'web' && plain(data.createdBy) && data.createdBy.uid === null && data.createdBy.role === 'public';
      const patient = reference('patients', data.patientId, mapPatientRecord, options.patientTargetSnapshot);
      if (!branch || !department || !doctor || (!guest && !patient)) return failure('MISSING_REFERENCE');
      if (guest) blockers.add('GUEST_RELATION_RELEASE_PENDING');
      if (doctor.rows.doctor.branchId !== branch.rows.branch.id || department.rows.department.branchId !== branch.rows.branch.id || !doctor.rows.doctorDepartments.some(row => row.departmentId === department.rows.department.id)) return failure('APPOINTMENT_RELATIONSHIP_CONFLICT');
      for (const dependency of [branch, department, doctor, ...(patient ? [patient] : [])]) {
        for (const reason of dependency.blockers || []) blockers.add(reason);
        for (const field of dependency.coverage.fields) if (field.status === 'blocked') blockers.add('APPOINTMENT_DEPENDENCY_BLOCKED');
        if (!dependency.targetSnapshotChecked) blockers.add('APPOINTMENT_DEPENDENCY_IDENTITY_UNCHECKED');
      }
      if (data.createdBy !== undefined && (!plain(data.createdBy) || !roles.has(data.createdBy.role) || !(data.createdBy.uid === null || text(data.createdBy.uid, 128)))) return failure('INVALID_APPOINTMENT_ACTOR');
      let consentVersion = null; let consentAcceptedAt = null;
      if (data.consent !== undefined) {
        if (!plain(data.consent) || !text(data.consent.version, 120) || !data.consent.version) return failure('INVALID_APPOINTMENT_CONSENT');
        instant(data.consent.acceptedAt);
        if (timestampNanos(data.consent.acceptedAt) > start) blockers.add('CONSENT_TIME_REVIEW');
        consentVersion = data.consent.version; consentAcceptedAt = data.consent.acceptedAt;
      } else blockers.add('HISTORICAL_CONSENT_MISSING');
      rows = { appointment: { id: legacyUuid('appointment', record.path.split('/')[1]), legacyId: record.path.split('/')[1], reference: data.reference, patientId: guest ? null : patient.rows.patient.id, doctorId: doctor.rows.doctor.id, branchId: branch.rows.branch.id, startsAt: data.startsAt, endsAt: data.endsAt, clinicDate: data.dateKey, status: data.status, source: data.source ?? null, createdByUid: data.createdBy?.uid ?? null, consentVersion, consentAcceptedAt, createdAt: data.createdAt ?? null, updatedAt: data.updatedAt ?? null } };
      rows.appointment.departmentId = department.rows.department.id;
      for (const field of ['reference', 'patientId', 'doctorId', 'branchId', 'startsAt', 'endsAt', 'status', 'source', 'createdAt', 'updatedAt']) targets[field] = `Appointment.${field}`;
      Object.assign(targets, { dateKey: 'Appointment.clinicDate', consent: 'Appointment.consentVersion/consentAcceptedAt' });
      if (data.createdBy === undefined) blockers.add('HISTORICAL_ACTOR_MISSING');
      else blockers.add('HISTORICAL_ACTOR_PROVENANCE_REVIEW');
      if (data.source === undefined) blockers.add('HISTORICAL_SOURCE_MISSING');
      const configs = records.filter(row => row.source === 'firestore' && row.path === 'clinic/publicConfig');
      const config = configs.length === 1 ? mapBookingConfig(configs[0], records, options.serviceTargetSnapshot) : null;
      const service = config?.status === 'mapped' ? config.rows.services.find(row => row.legacyId === data.visitType) : null;
      if (service) {
        rows.appointment.serviceId = service.id;
        targets.visitType = 'Appointment.service';
        if (!config.targetSnapshotChecked) blockers.add('SERVICE_TARGET_IDENTITY_UNCHECKED');
        if (service.consultationMode !== data.visitMode) blockers.add('HISTORICAL_SERVICE_MODE_MISMATCH');
        // Current config cannot prove an old appointment's price or duration.
        blockers.add('HISTORICAL_SERVICE_VERSION_REVIEW');
      } else {
        blockers.add('SERVICE_IDENTITY_MAPPING_PENDING');
        blockers.add(config?.status === 'mapped' ? 'HISTORICAL_SERVICE_UNRESOLVED' : 'BOOKING_CONFIG_UNRESOLVED');
      }
      blockers.add('DOCTOR_SERVICE_ASSIGNMENT_REVIEW');
    }
    for (const field of ['createdAt', 'updatedAt']) {
      if (data[field] !== undefined) instant(data[field]);
      else if (inspection.category === 'appointments') blockers.add(field === 'createdAt' ? 'SOURCE_CREATED_AT_MISSING' : 'SOURCE_UPDATED_AT_MISSING');
    }
    for (const field of ['source', 'reason', 'phoneKey', 'slotId']) if (data[field] !== undefined && data[field] !== null && !text(data[field], field === 'reason' ? 2000 : 160)) return failure('INVALID_APPOINTMENT_FIELD');
    if (data.slotIds !== undefined && (!Array.isArray(data.slotIds) || data.slotIds.some(id => !text(id, 160)))) return failure('INVALID_APPOINTMENT_FIELD');
    const kind = inspection.category === 'appointments' ? 'appointment' : 'appointment_event';
    const row = kind === 'appointment' ? rows.appointment : rows.appointmentEvent;
    const legacyId = kind === 'appointment' ? record.path.split('/')[1] : record.path;
    const identity = appointmentIdentity(options.appointmentTargetSnapshot)(kind, legacyId, row);
    row.id = identity.id;
    if (kind === 'appointment_event') row.legacyId = legacyId;
    if (identity.snapshotChecked) blockers.delete('APPOINTMENT_TARGET_IDENTITY_PENDING');
    const details = appointmentFields(record, row, { timestampNanos, validDate });
    Object.assign(targets, details.targets);
    Object.assign(rows, details.rows);
    for (const reason of details.blockers) blockers.add(reason);
    const precisionFields = new Set(details.fields.map(field => field.source));
    for (const source of Object.keys(data).sort()) {
      if (precisionFields.has(source)) continue;
      const target = targets[source];
      if (target) coverage.push({ source, target, status: 'mapped' });
      else { coverage.push({ source, status: 'blocked', reason: 'APPOINTMENT_TARGET_FIELD_PENDING' }); blockers.add('APPOINTMENT_TARGET_FIELD_PENDING'); }
    }
    coverage.push(...details.fields);
    return { status: 'mapped', readyForApply: false, identityDecision: identity.decision, targetSnapshotChecked: identity.snapshotChecked, rows, blockers: [...blockers].sort(), coverage: { fields: coverage, mapped: coverage.filter(field => field.status === 'mapped').length, blocked: coverage.filter(field => field.status === 'blocked').length }, source: structuredClone(record) };
  } catch (error) { return failure(error.migrationCode || 'INVALID_APPOINTMENT_RECORD'); }
}

function rehearse(records, { pageSize = 100, targetSnapshot, patientTargetSnapshot, serviceTargetSnapshot, appointmentTargetSnapshot, scheduleTargetSnapshot, clinicalTargetSnapshot, experienceTargetSnapshot, registryTargetSnapshot } = {}) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 500) throw new Error('INVALID_PAGE_SIZE');
  if (!Array.isArray(records) || records.length > 10000) throw new Error('INVALID_BATCH');
  const report = { mode: 'dry_run', total: records.length, mapped: 0, deferred: 0, excluded: 0, rejected: 0, readyForApply: 0, writes: 0, unmappedFields: 0, identityDecisions: { reused: 0, newCandidates: 0 }, mappingBlockers: {}, counts: {}, reasons: {} };
  let resolveId; let snapshotError;
  report.scheduleAssessment = { assessed: 0, rejected: 0, blockers: {} };
  report.scheduleProjection = { assessed: 0, candidates: 0, deferred: 0, rejected: 0, blockers: {} };
  report.patientAssessment = { assessed: 0, candidates: 0, rejected: 0, reused: 0, newCandidates: 0, blockers: {} };
  report.appointmentAssessment = { assessed: 0, candidates: 0, rejected: 0, blockers: {} };
  report.configAssessment = { assessed: 0, candidates: 0, rejected: 0, services: 0, blockers: {} };
  report.clinicalAssessment = { assessed: 0, candidates: 0, rejected: 0, blockers: {} };
  report.experienceAssessment = { assessed: 0, candidates: 0, rejected: 0, blockers: {} };
  report.registryAssessment = { assessed: 0, candidates: 0, rejected: 0, blockers: {} };
  report.ownershipAssessment = { assessed: 0, rejected: 0, claims: 0, grants: 0, blockers: {} };
  report.timestampPreparation = { prepared: 0, rejected: 0, instants: 0, blockers: {} };
  const assessTimestamps = candidate => {
    if (candidate.status !== 'mapped') return;
    const prepared = prepareMigrationTimestamps(candidate);
    report.timestampPreparation[prepared.status === 'prepared' ? 'prepared' : 'rejected'] += 1;
    report.timestampPreparation.instants += prepared.rows?.legacySourceInstants.length || 0;
    for (const reason of prepared.blockers || [prepared.reason]) report.timestampPreparation.blockers[reason] = (report.timestampPreparation.blockers[reason] || 0) + 1;
  };
  try { resolveId = catalogIdentity(targetSnapshot); } catch (error) { snapshotError = error.migrationCode || 'INVALID_TARGET_SNAPSHOT'; }
  // shortcut: catalog lookups scan this bounded in-memory batch; index references
  // before adding an actual export/checkpoint reader in the next migration step.
  for (let offset = 0; offset < records.length; offset += pageSize) {
    for (const record of records.slice(offset, offset + pageSize)) {
      const inspection = inspectRecord(record);
      const category = inspection.category || 'unknown';
      report.counts[category] = (report.counts[category] || 0) + 1;
      let result = inspection;
      if (['counters', 'booking_requests'].includes(category)) {
        const registry = mapRegistryRecord(record, records, { targetSnapshot, patientTargetSnapshot, serviceTargetSnapshot, appointmentTargetSnapshot, registryTargetSnapshot });
        assessTimestamps(registry);
        report.registryAssessment.assessed += 1;
        report.registryAssessment[registry.status === 'mapped' ? 'candidates' : 'rejected'] += 1;
        for (const reason of registry.blockers || [registry.reason]) report.registryAssessment.blockers[reason] = (report.registryAssessment.blockers[reason] || 0) + 1;
      }
      if (['feedback', 'audit'].includes(category)) {
        const history = mapExperienceRecord(record, records, { targetSnapshot, patientTargetSnapshot, serviceTargetSnapshot, appointmentTargetSnapshot, experienceTargetSnapshot });
        assessTimestamps(history);
        report.experienceAssessment.assessed += 1;
        report.experienceAssessment[history.status === 'mapped' ? 'candidates' : 'rejected'] += 1;
        for (const reason of history.blockers || [history.reason]) report.experienceAssessment.blockers[reason] = (report.experienceAssessment.blockers[reason] || 0) + 1;
      }
      if (['medical_history', 'medical_documents'].includes(category)) {
        const clinical = mapClinicalRecord(record, records, { targetSnapshot, patientTargetSnapshot, clinicalTargetSnapshot });
        assessTimestamps(clinical);
        report.clinicalAssessment.assessed += 1;
        report.clinicalAssessment[clinical.status === 'mapped' ? 'candidates' : 'rejected'] += 1;
        for (const reason of clinical.blockers || [clinical.reason]) report.clinicalAssessment.blockers[reason] = (report.clinicalAssessment.blockers[reason] || 0) + 1;
      }
      if (category === 'public_config') {
        const config = mapBookingConfig(record, records, serviceTargetSnapshot);
        assessTimestamps(config);
        report.configAssessment.assessed += 1;
        report.configAssessment[config.status === 'mapped' ? 'candidates' : 'rejected'] += 1;
        report.configAssessment.services += config.rows?.services.length || 0;
        for (const reason of config.blockers || [config.reason]) report.configAssessment.blockers[reason] = (report.configAssessment.blockers[reason] || 0) + 1;
      }
      if (['appointments', 'appointment_events'].includes(category)) {
        const appointment = mapAppointmentRecord(record, records, { targetSnapshot, patientTargetSnapshot, serviceTargetSnapshot, appointmentTargetSnapshot });
        assessTimestamps(appointment);
        report.appointmentAssessment.assessed += 1;
        report.appointmentAssessment[appointment.status === 'mapped' ? 'candidates' : 'rejected'] += 1;
        for (const reason of appointment.blockers || [appointment.reason]) report.appointmentAssessment.blockers[reason] = (report.appointmentAssessment.blockers[reason] || 0) + 1;
      }
      if (category === 'patients') {
        const ownership = assessPatientOwnership(record, records, { patientTargetSnapshot });
        report.ownershipAssessment[ownership.status === 'assessed' ? 'assessed' : 'rejected'] += 1;
        report.ownershipAssessment.claims += ownership.claims?.length || 0;
        for (const reason of ownership.blockers || [ownership.reason]) report.ownershipAssessment.blockers[reason] = (report.ownershipAssessment.blockers[reason] || 0) + 1;
        const patient = mapPatientRecord(record, records, patientTargetSnapshot);
        assessTimestamps(patient);
        report.patientAssessment.assessed += 1;
        if (patient.status === 'mapped') {
          report.patientAssessment.candidates += 1;
          report.patientAssessment[patient.identityDecision === 'reuse_existing' ? 'reused' : 'newCandidates'] += 1;
        } else report.patientAssessment.rejected += 1;
        for (const reason of patient.blockers || [patient.reason]) report.patientAssessment.blockers[reason] = (report.patientAssessment.blockers[reason] || 0) + 1;
      }
      if (['schedules', 'exceptions', 'old_schedules'].includes(category) || (category === 'doctors' && Object.hasOwn(record.data, 'weeklySchedule'))) {
        const schedule = assessSchedule(record, records);
        report.scheduleAssessment.assessed += 1;
        if (schedule.status === 'rejected') report.scheduleAssessment.rejected += 1;
        for (const reason of schedule.blockers || [schedule.reason]) report.scheduleAssessment.blockers[reason] = (report.scheduleAssessment.blockers[reason] || 0) + 1;
        const projection = mapScheduleRecord(record, records, { targetSnapshot, scheduleTargetSnapshot });
        assessTimestamps(projection);
        report.scheduleProjection.assessed += 1;
        report.scheduleProjection[projection.status === 'mapped' ? 'candidates' : projection.status === 'deferred' ? 'deferred' : 'rejected'] += 1;
        for (const reason of projection.blockers || [projection.reason]) report.scheduleProjection.blockers[reason] = (report.scheduleProjection.blockers[reason] || 0) + 1;
      }
      if (inspection.status !== 'rejected') {
        if (inspection.disposition === 'catalog_candidate') {
          try { result = snapshotError ? failure(snapshotError) : mapCatalog(record, records, resolveId); }
          catch (error) { result = failure(error.migrationCode || 'INVALID_CATALOG_RECORD'); }
        }
        else result = { status: inspection.disposition === 'deferred' ? 'deferred' : 'excluded', reason: inspection.disposition === 'deferred' ? 'MODULE_NOT_READY' : 'NOT_A_MIGRATION_SOURCE' };
      }
      report[result.status === 'mapped' ? 'mapped' : result.status === 'deferred' ? 'deferred' : result.status === 'excluded' ? 'excluded' : 'rejected'] += 1;
      if (result.reason) report.reasons[result.reason] = (report.reasons[result.reason] || 0) + 1;
      if (result.status === 'mapped') {
        assessTimestamps(result);
        report.identityDecisions[result.identityDecision === 'reuse_existing' ? 'reused' : 'newCandidates'] += 1;
        report.unmappedFields += result.coverage.blocked;
        for (const field of result.coverage.fields) if (field.reason) report.mappingBlockers[field.reason] = (report.mappingBlockers[field.reason] || 0) + 1;
      }
    }
  }
  report.counts = Object.fromEntries(Object.entries(report.counts).sort());
  report.reasons = Object.fromEntries(Object.entries(report.reasons).sort());
  report.mappingBlockers = Object.fromEntries(Object.entries(report.mappingBlockers).sort());
  report.scheduleAssessment.blockers = Object.fromEntries(Object.entries(report.scheduleAssessment.blockers).sort());
  report.scheduleProjection.blockers = Object.fromEntries(Object.entries(report.scheduleProjection.blockers).sort());
  report.patientAssessment.blockers = Object.fromEntries(Object.entries(report.patientAssessment.blockers).sort());
  report.appointmentAssessment.blockers = Object.fromEntries(Object.entries(report.appointmentAssessment.blockers).sort());
  report.configAssessment.blockers = Object.fromEntries(Object.entries(report.configAssessment.blockers).sort());
  report.clinicalAssessment.blockers = Object.fromEntries(Object.entries(report.clinicalAssessment.blockers).sort());
  report.experienceAssessment.blockers = Object.fromEntries(Object.entries(report.experienceAssessment.blockers).sort());
  report.registryAssessment.blockers = Object.fromEntries(Object.entries(report.registryAssessment.blockers).sort());
  report.ownershipAssessment.blockers = Object.fromEntries(Object.entries(report.ownershipAssessment.blockers).sort());
  report.timestampPreparation.blockers = Object.fromEntries(Object.entries(report.timestampPreparation.blockers).sort());
  return report;
}
module.exports = { manifest, inspectRecord, mapCatalogRecord, mapPatientRecord, mapAppointmentRecord, mapBookingConfig, mapScheduleRecord, mapClinicalRecord, mapExperienceRecord, mapRegistryRecord, assessPatientOwnership, assessSchedule, legacyUuid, validDate, validTimestamp, timestampNanos, paise, rehearse };
