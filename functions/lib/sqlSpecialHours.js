const { createHash, randomUUID } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { requireLiveStaff } = require('./staffAuthorization');
const { isDoctorId } = require('./staffAccess');
const { istInstant } = require('./ist');
const { sqlWeeklyHoursCallableOptions: sqlSpecialHoursCallableOptions } = require('./sqlWeeklyHours');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid = () => new HttpsError('invalid-argument', 'Select a doctor, valid date and one to four non-overlapping special-hours sessions.');
const incomplete = () => new HttpsError('failed-precondition', 'The clinic must reconcile this SQL schedule before editing special hours.');
const stale = () => new HttpsError('aborted', 'Clinic hours changed. Reload the latest schedule before saving.');
const uncertain = () => new HttpsError('unavailable', 'The save could not be confirmed. Retry unchanged details or reload before editing.');
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw invalid();
  return value;
}
function id(value) {
  const result = typeof value === 'string' ? value.replaceAll('-', '').toLowerCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5') : '';
  if (!uuid.test(result)) throw incomplete();
  return result;
}
function version(value, error = invalid) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) throw error();
  return value.replace(/(?:\.(\d+))?Z$/, (_, fraction = '') => `.${fraction.padEnd(6, '0')}Z`);
}
function windows(value, error = invalid) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) throw error();
  const result = value.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !['startMinute', 'endMinute'].includes(key))
      || !Number.isInteger(row.startMinute) || !Number.isInteger(row.endMinute) || row.startMinute < 0 || row.endMinute > 1439 || row.startMinute >= row.endMinute) throw error();
    return { startMinute: row.startMinute, endMinute: row.endMinute };
  }).sort((a, b) => a.startMinute - b.startMinute);
  if (result.some((row, index) => index && row.startMinute < result[index - 1].endMinute)) throw error();
  return result;
}
function project(raw, doctorLegacyId, date) {
  if (raw?.user?.active !== true) throw new HttpsError('permission-denied', 'Current active SQL staff access is required.');
  if (!Array.isArray(raw.doctors) || raw.doctors.length !== 1) throw incomplete();
  const doctor = raw.doctors[0]; const doctorId = id(doctor.id);
  if (doctor.legacyId !== doctorLegacyId || doctor.active !== true || doctor.branch?.timezone !== 'Asia/Kolkata' || doctor.state?.authority !== 'doctor_schedule'
    || typeof doctor.name !== 'string' || !doctor.name.trim() || doctor.name.length > 160 || /[\x00-\x1f\x7f]/.test(doctor.name)
    || !Array.isArray(doctor.exceptions) || doctor.exceptions.length > 1) throw incomplete();
  let exception = null;
  if (doctor.exceptions.length) {
    const row = doctor.exceptions[0];
    if (id(row.doctorId) !== doctorId || row.date !== date || !['extra', 'replace', 'closed'].includes(row.kind)) throw incomplete();
    if (row.kind === 'closed' && (!Array.isArray(row.sessions) || row.sessions.length)) throw incomplete();
    exception = { id: id(row.id), kind: row.kind, sessions: row.kind === 'closed' ? [] : windows(row.sessions, incomplete) };
  }
  return { doctorId, doctorLegacyId, doctorName: doctor.name, date, timezone: 'Asia/Kolkata', updatedAt: version(doctor.state.updatedAt, incomplete), exception };
}
function createSqlSpecialHours({ auth, store }) {
  async function authority(request) {
    if (typeof request?.app?.appId !== 'string' || !request.app.appId || request.app.alreadyConsumed === true) throw new HttpsError('failed-precondition', 'Reload the clinic website to verify this request.');
    if (typeof request.data?.doctorId !== 'string' || !isDoctorId(request.data.doctorId) || typeof request.data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(request.data.date)) throw invalid();
    try { istInstant(request.data.date); } catch { throw invalid(); }
    const actor = await requireLiveStaff(auth, request, { roles: ['admin', 'doctor'], doctorId: request.data.doctorId });
    if (request.auth.token.auth_time > Date.now() / 1000 + 60) throw new HttpsError('permission-denied', 'Sign in again to verify staff access.');
    return actor;
  }
  const read = async (actorUid, doctorId, date) => project(await store.read({ actorUid, doctorId, date }), doctorId, date);
  async function receipt(data) {
    const operation = await store.receipt({ actorUid: data.actorUid, requestId: data.requestId });
    if (operation !== null && operation !== data.operation) throw new HttpsError('already-exists', 'This request was used for different hours. Reload before saving.');
    return operation === data.operation;
  }
  return {
    async get(request) {
      const actor = await authority(request); object(request.data, ['doctorId', 'date']);
      try {
        const current = await read(actor.uid, request.data.doctorId, request.data.date);
        return { doctorId: current.doctorLegacyId, doctorName: current.doctorName, date: current.date, timezone: current.timezone, updatedAt: current.updatedAt,
          exception: current.exception ? { kind: current.exception.kind, sessions: current.exception.sessions } : null };
      } catch (error) { if (error instanceof HttpsError) throw error; throw new HttpsError('unavailable', 'Special hours could not be loaded. Please retry.'); }
    },
    async save(request) {
      const actor = await authority(request);
      const input = object(request.data, ['doctorId', 'date', 'kind', 'sessions', 'expectedUpdatedAt', 'requestId']);
      if (!['extra', 'replace'].includes(input.kind) || typeof input.requestId !== 'string' || !uuid.test(input.requestId)) throw invalid();
      const expectedUpdatedAt = version(input.expectedUpdatedAt); const sessions = windows(input.sessions);
      let data; let submitted = false;
      try {
        const current = await read(actor.uid, input.doctorId, input.date);
        data = { actorUid: actor.uid, actorRole: actor.customClaims.role, doctorId: current.doctorId, doctorLegacyId: input.doctorId,
          date: input.date, kind: input.kind, sessions, expectedUpdatedAt, requestId: input.requestId.toLowerCase() };
        data.operation = `doctor_special_hours:${createHash('sha256').update(JSON.stringify(data)).digest('hex')}`;
        if (await receipt(data)) return { saved: true };
        if (current.updatedAt !== expectedUpdatedAt) throw stale();
        if (current.exception?.kind === 'closed') throw new HttpsError('failed-precondition', 'Use the appointment-impact workflow to change a closed day.');
        submitted = true;
        await store.save({ ...data, exceptionId: current.exception?.id ?? randomUUID(), creating: current.exception === null });
        return { saved: true };
      } catch (error) {
        if (error instanceof HttpsError && !submitted) throw error;
        try {
          await authority(request); await read(actor.uid, input.doctorId, input.date);
          if (data && await receipt(data)) return { saved: true };
        } catch (recheck) { if (recheck instanceof HttpsError && ['permission-denied', 'already-exists'].includes(recheck.code)) throw recheck; }
        if (typeof error?.message === 'string' && /SPECIAL_HOURS_VERSION_CHANGED|SPECIAL_HOURS_DATE_CONFLICT|SPECIAL_HOURS_EXCEPTION_UNAVAILABLE/.test(error.message)) throw stale();
        throw uncertain();
      }
    },
  };
}
function sqlSpecialHoursStore(dc) {
  const sdk = require('../generated/sql');
  return {
    read: async data => (await sdk.readDoctorSpecialHours(dc, data)).data,
    receipt: async data => (await sdk.readDoctorSpecialHoursReceipt(dc, data)).data.operationReceipt?.operation ?? null,
    save: ({ sessions, ...data }) => {
      const padded = Array.from({ length: 4 }, (_, index) => sessions[index] || { startMinute: 0, endMinute: 0 });
      return sdk.saveDoctorSpecialHours(dc, { ...data, editing: !data.creating, resourceId: `${data.doctorLegacyId}/${data.date}`,
        starts: padded.map(row => row.startMinute), ends: padded.map(row => row.endMinute),
        ...Object.fromEntries(padded.map((_, index) => [`row${index}`, index < sessions.length])) });
    },
  };
}
function createSqlSpecialHoursBackend({ auth, dc }) {
  const service = createSqlSpecialHours({ auth, store: sqlSpecialHoursStore(dc) });
  return Object.freeze({ getSqlDoctorSpecialHours: request => service.get(request), saveSqlDoctorSpecialHours: request => service.save(request) });
}
module.exports = { createSqlSpecialHours, sqlSpecialHoursStore, createSqlSpecialHoursBackend, sqlSpecialHoursCallableOptions };
