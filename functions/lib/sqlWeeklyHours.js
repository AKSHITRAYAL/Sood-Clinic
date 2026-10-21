const { createHash } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { requireLiveStaff } = require('./staffAuthorization');
const { isDoctorId } = require('./staffAccess');
const { sqlPatientCallableOptions: sqlWeeklyHoursCallableOptions } = require('./sqlPatientHandlers');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid = () => new HttpsError('invalid-argument', 'Enter up to fourteen valid, non-overlapping weekly sessions and the current revision.');
const incomplete = () => new HttpsError('failed-precondition', 'Reconcile and initialize this doctor’s SQL weekly schedule before editing.');
const stale = () => new HttpsError('aborted', 'Weekly hours changed. Reload the latest schedule before editing.');
const uncertain = () => new HttpsError('unavailable', 'The save could not be confirmed. Retry unchanged details or reload the latest schedule.');
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw invalid();
  return value;
}
function timestamp(value, error = invalid) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) throw error();
  return value.replace(/(?:\.(\d+))?Z$/, (_, fraction = '') => `.${fraction.padEnd(6, '0')}Z`);
}
function sessions(value, error = invalid) {
  if (!Array.isArray(value) || value.length > 14) throw error();
  const result = value.map(row => {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).some(key => !['weekday', 'startMinute', 'endMinute'].includes(key))
      || !Number.isInteger(row.weekday) || row.weekday < 0 || row.weekday > 6 || !Number.isInteger(row.startMinute) || !Number.isInteger(row.endMinute)
      || row.startMinute < 0 || row.endMinute > 1439 || row.startMinute >= row.endMinute) throw error();
    return { weekday: row.weekday, startMinute: row.startMinute, endMinute: row.endMinute };
  }).sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
  if (result.some((row, index) => index && row.weekday === result[index - 1].weekday && row.startMinute < result[index - 1].endMinute)) throw error();
  return result;
}
function project(raw, doctorLegacyId) {
  if (raw?.user?.active !== true) throw new HttpsError('permission-denied', 'Current active SQL staff access is required.');
  const rows = raw.doctors;
  if (!Array.isArray(rows) || rows.length !== 1) throw incomplete();
  const row = rows[0];
  const doctorId = typeof row.id === 'string' ? row.id.replaceAll('-', '').toLowerCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5') : '';
  if (!uuid.test(doctorId) || row.legacyId !== doctorLegacyId || row.active !== true || row.branch?.timezone !== 'Asia/Kolkata' || row.state?.authority !== 'doctor_schedule'
    || typeof row.name !== 'string' || !row.name.trim() || row.name.length > 160 || /[\x00-\x1f\x7f]/.test(row.name)) throw incomplete();
  return { doctorId, doctorLegacyId, doctorName: row.name, timezone: 'Asia/Kolkata', updatedAt: timestamp(row.state.updatedAt, incomplete), sessions: sessions(row.sessions, incomplete) };
}
function createSqlWeeklyHours({ auth, store }) {
  async function authority(request) {
    if (typeof request?.app?.appId !== 'string' || !request.app.appId || request.app.alreadyConsumed === true) throw new HttpsError('failed-precondition', 'Reload the clinic website to verify this request.');
    if (typeof request.data?.doctorId !== 'string' || !isDoctorId(request.data.doctorId)) throw invalid();
    const actor = await requireLiveStaff(auth, request, { roles: ['admin', 'doctor'], doctorId: request.data.doctorId });
    if (request.auth.token.auth_time > Date.now() / 1000 + 60) throw new HttpsError('permission-denied', 'Sign in again to verify staff access.');
    return actor;
  }
  async function read(actorUid, doctorLegacyId) { return project(await store.read({ actorUid, doctorId: doctorLegacyId }), doctorLegacyId); }
  async function receipt(data) {
    const operation = await store.receipt({ actorUid: data.actorUid, requestId: data.requestId });
    if (operation !== null && operation !== data.operation) throw new HttpsError('already-exists', 'This request was used for different schedule details. Reload before saving.');
    return operation === data.operation;
  }
  return {
    async get(request) {
      const actor = await authority(request); object(request.data, ['doctorId']);
      try {
        const { doctorId, ...result } = await read(actor.uid, request.data.doctorId);
        return result;
      } catch (error) { if (error instanceof HttpsError) throw error; throw new HttpsError('unavailable', 'Weekly hours could not be loaded. Please retry.'); }
    },
    async save(request) {
      const actor = await authority(request);
      const input = object(request.data, ['doctorId', 'sessions', 'expectedUpdatedAt', 'requestId']);
      if (typeof input.requestId !== 'string' || !uuid.test(input.requestId)) throw invalid();
      const expectedUpdatedAt = timestamp(input.expectedUpdatedAt); const weekly = sessions(input.sessions);
      let data;
      try {
        const current = await read(actor.uid, input.doctorId);
        data = { actorUid: actor.uid, actorRole: actor.customClaims.role, doctorId: current.doctorId, doctorLegacyId: input.doctorId,
          requestId: input.requestId.toLowerCase(), expectedUpdatedAt, sessions: weekly };
        data.operation = `doctor_weekly_hours:${createHash('sha256').update(JSON.stringify(data)).digest('hex')}`;
        if (await receipt(data)) return { saved: true };
        if (current.updatedAt !== expectedUpdatedAt) throw stale();
        await store.save(data);
        return { saved: true };
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        // A rejected acknowledgement does not establish whether SQL committed.
        try {
          await authority(request); await read(actor.uid, input.doctorId);
          if (data && await receipt(data)) return { saved: true };
        } catch (recheck) { if (recheck instanceof HttpsError && ['permission-denied', 'already-exists'].includes(recheck.code)) throw recheck; }
        if (typeof error?.message === 'string' && error.message.includes('WEEKLY_HOURS_VERSION_CHANGED')) throw stale();
        throw uncertain();
      }
    },
  };
}
function sqlWeeklyHoursStore(dc) {
  const sdk = require('../generated/sql');
  return {
    read: async data => (await sdk.readDoctorWeeklyHours(dc, data)).data,
    receipt: async data => (await sdk.readDoctorWeeklyHoursReceipt(dc, data)).data.operationReceipt?.operation ?? null,
    save: ({ sessions: weekly, ...data }) => {
      const padded = Array.from({ length: 14 }, (_, index) => weekly[index] || { weekday: 0, startMinute: 0, endMinute: 0 });
      return sdk.saveDoctorWeeklyHours(dc, { ...data, weekdays: padded.map(row => row.weekday), starts: padded.map(row => row.startMinute), ends: padded.map(row => row.endMinute),
        ...Object.fromEntries(padded.map((_, index) => [`row${index}`, index < weekly.length])) });
    },
  };
}
function createSqlWeeklyHoursBackend({ auth, dc }) {
  const service = createSqlWeeklyHours({ auth, store: sqlWeeklyHoursStore(dc) });
  return Object.freeze({ getSqlDoctorWeeklyHours: request => service.get(request), saveSqlDoctorWeeklyHours: request => service.save(request) });
}
module.exports = { createSqlWeeklyHours, sqlWeeklyHoursStore, createSqlWeeklyHoursBackend, sqlWeeklyHoursCallableOptions };
