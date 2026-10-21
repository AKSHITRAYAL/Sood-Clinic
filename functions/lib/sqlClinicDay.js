const { HttpsError } = require('firebase-functions/v2/https');
const { requireLiveStaff } = require('./staffAuthorization');
const { isDoctorId } = require('./staffAccess');
const { istDateKey, istInstant } = require('./ist');
const invalid = () => new HttpsError('invalid-argument', 'Select an exact doctor, clinic date and valid page.');
const incomplete = () => new HttpsError('failed-precondition', 'The clinic needs to review this day before it can be displayed.');
const statuses = new Set(['scheduled', 'confirmed', 'checked_in', 'in_consultation', 'completed', 'cancelled', 'no_show']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw invalid();
  return value;
}
function id(value) {
  if (typeof value !== 'string') throw incomplete();
  const result = value.replaceAll('-', '').toLowerCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  if (!uuid.test(result)) throw incomplete();
  return result;
}
function timestamp(value, error = incomplete) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) throw error();
  return value.replace(/(?:\.(\d+))?Z$/, (_, fraction = '') => `.${fraction.padEnd(6, '0')}Z`);
}
function text(value, max, error = incomplete) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw error();
  return value;
}

// No patient identifiers, clinical reason, contact, meeting links or event metadata.
function createSqlClinicDay({ auth, store }) {
  return {
    async list(request) {
      if (!request?.app?.appId || typeof request.app.appId !== 'string' || request.app.alreadyConsumed === true) throw new HttpsError('failed-precondition', 'Reload the clinic website to verify this request.');
      const input = object(request.data, ['doctorId', 'date', 'cursor']);
      if (typeof input.doctorId !== 'string' || !isDoctorId(input.doctorId) || typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw invalid();
      try { istInstant(input.date); } catch { throw invalid(); }
      const actor = await requireLiveStaff(auth, request, { doctorId: input.doctorId });
      if (request.auth.token.auth_time > Date.now() / 1000 + 60) throw new HttpsError('permission-denied', 'Sign in again to verify staff access.');
      let cursor = null;
      if (input.cursor != null) {
        object(input.cursor, ['startsAt', 'reference']);
        cursor = { startsAt: timestamp(input.cursor.startsAt, invalid), reference: text(input.cursor.reference, 120, invalid) };
        if (istDateKey(new Date(cursor.startsAt)) !== input.date) throw invalid();
      }
      try {
        const doctors = await store.read({ actorUid: actor.uid, actorRole: actor.customClaims.role, doctorId: input.doctorId, date: input.date, cursor });
        if (!Array.isArray(doctors) || doctors.length !== 1 || doctors[0].legacyId !== input.doctorId) throw incomplete();
        const doctor = doctors[0]; const doctorId = id(doctor.id);
        if (!Array.isArray(doctor.appointments) || doctor.appointments.length > 21) throw incomplete();
        const seen = new Set(); const references = new Set(); let previous = cursor;
        const page = doctor.appointments.map(row => {
          if (!row || id(row.doctorId) !== doctorId || row.clinicDate !== input.date || !statuses.has(row.status)
            || !['in_person', 'video'].includes(row.visitMode) || row.branch?.timezone !== 'Asia/Kolkata') throw incomplete();
          const startsAt = timestamp(row.startsAt); const endsAt = timestamp(row.endsAt);
          const reference = text(row.reference, 120); const appointmentId = id(row.id);
          if (endsAt <= startsAt || istDateKey(new Date(startsAt)) !== input.date || seen.has(appointmentId) || references.has(reference)
            || (previous && (startsAt < previous.startsAt || (startsAt === previous.startsAt && reference === previous.reference)))) throw incomplete();
          seen.add(appointmentId); references.add(reference); previous = { startsAt, reference };
          return { id: appointmentId, reference, startsAt, endsAt, clinicDate: input.date, status: row.status, visitMode: row.visitMode,
            updatedAt: timestamp(row.updatedAt), branchName: text(row.branch.name, 160), serviceName: text(row.service?.name, 100) };
        });
        const appointments = page.slice(0, 20); const last = appointments.at(-1);
        // PostgreSQL owns reference collation. Refresh after concurrent rescheduling.
        return { doctorId: input.doctorId, doctorName: text(doctor.name, 160), date: input.date, timezone: 'Asia/Kolkata', appointments,
          nextCursor: page.length > 20 ? { startsAt: last.startsAt, reference: last.reference } : null };
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('unavailable', 'Clinic day could not be loaded. Please retry.');
      }
    },
  };
}
function sqlClinicDayStore(dc) {
  const sdk = require('../generated/sql');
  return {
    async read({ actorUid, actorRole, doctorId, date, cursor }) {
      const data = { actorUid, actorRole, doctorId, date, resourceId: `${doctorId}/${date}` };
      const response = cursor
        ? await sdk.readStaffClinicDayAfter(dc, { ...data, afterStartsAt: cursor.startsAt, afterReference: cursor.reference })
        : await sdk.readStaffClinicDay(dc, data);
      return response.data.query.doctors;
    },
  };
}
function createSqlClinicDayBackend({ auth, dc }) {
  const service = createSqlClinicDay({ auth, store: sqlClinicDayStore(dc) });
  return Object.freeze({ listSqlStaffClinicDay: request => service.list(request) });
}
const { sqlPatientCallableOptions: sqlClinicDayCallableOptions } = require('./sqlPatientHandlers');
module.exports = { createSqlClinicDay, sqlClinicDayStore, createSqlClinicDayBackend, sqlClinicDayCallableOptions };
