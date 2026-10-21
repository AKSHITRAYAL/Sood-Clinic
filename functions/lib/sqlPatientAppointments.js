const { HttpsError } = require('firebase-functions/v2/https');
const { requireLivePatient } = require('./patientAuthorization');
const { istDateKey } = require('./ist');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = new Set(['scheduled', 'confirmed', 'checked_in', 'in_consultation', 'completed', 'cancelled', 'no_show']);
const invalid = () => new HttpsError('invalid-argument', 'Choose a patient and valid appointment history page.');
const denied = () => new HttpsError('permission-denied', 'This patient history is not available to your account.');
const incomplete = () => new HttpsError('failed-precondition', 'The clinic needs to review this appointment history before it can be displayed.');
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw invalid();
  return value;
}
function id(value, error = invalid) {
  if (typeof value !== 'string' || !uuid.test(value)) throw error();
  return value.toLowerCase();
}
function sqlId(value) {
  return id(typeof value === 'string' ? value.replaceAll('-', '').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5') : '', incomplete);
}
function timestamp(value, error = incomplete) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) throw error();
  return value.replace(/(?:\.(\d+))?Z$/, (_, fraction = '') => `.${fraction.padEnd(6, '0')}Z`);
}
function text(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw incomplete();
  return value;
}
function rows(envelope, patientId) {
  const link = envelope?.patientLink;
  if (envelope?.user?.active !== true || !link || !['self', 'guardian'].includes(link.relationship)
    || !link.verifiedBy || !link.verifiedAt || !link.patient || link.patient.archivedAt != null) throw denied();
  if (sqlId(link.patient.id) !== patientId) throw denied();
  if (!Array.isArray(link.patient.appointments)) throw incomplete();
  return link.patient.appointments;
}
function project(row, patientId) {
  if (!row || sqlId(row.patientId) !== patientId) throw incomplete();
  const startsAt = timestamp(row.startsAt); const endsAt = timestamp(row.endsAt);
  if (endsAt <= startsAt || row.clinicDate !== istDateKey(new Date(startsAt)) || !statuses.has(row.status)
    || !['in_person', 'video'].includes(row.visitMode) || row.branch?.timezone !== 'Asia/Kolkata') throw incomplete();
  return {
    id: sqlId(row.id), reference: text(row.reference, 120), startsAt, endsAt,
    clinicDate: row.clinicDate, status: row.status, visitMode: row.visitMode, updatedAt: timestamp(row.updatedAt),
    doctorName: text(row.doctor?.name, 160), branchName: text(row.branch?.name, 160),
    branchAddress: text(row.branch?.address, 500), serviceName: text(row.service?.name, 100), timezone: 'Asia/Kolkata',
  };
}
// Local read-only SQL preparation. No patient callable or legacy authorization change.
function createSqlPatientAppointments({ auth, store }) {
  async function run(read) {
    try { return await read(); }
    catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('unavailable', 'Appointment history could not be loaded. Please retry.');
    }
  }
  return {
    async list(request) {
      await requireLivePatient(auth, request);
      const input = object(request.data, ['patientId', 'cursor']);
      const patientId = id(input.patientId);
      let cursor = null;
      if (input.cursor != null) {
        object(input.cursor, ['startsAt', 'reference']);
        if (typeof input.cursor.reference !== 'string' || !input.cursor.reference.trim() || input.cursor.reference.length > 120 || /[\x00-\x1f\x7f]/.test(input.cursor.reference)) throw invalid();
        cursor = { startsAt: timestamp(input.cursor.startsAt, invalid), reference: input.cursor.reference };
      }
      return run(async () => {
        const result = rows(await store.list({ actorUid: request.auth.uid, patientId, cursor }), patientId);
        if (result.length > 21) throw incomplete();
        const page = result.map(row => project(row, patientId));
        const seen = new Set(); const references = new Set(); let previous = cursor;
        for (const row of page) {
          // PostgreSQL, not JS locale ordering, defines the unique-reference tie break.
          if (seen.has(row.id) || references.has(row.reference) || (previous && (row.startsAt > previous.startsAt || (row.startsAt === previous.startsAt && row.reference === previous.reference)))) throw incomplete();
          seen.add(row.id); references.add(row.reference); previous = row;
        }
        const appointments = page.slice(0, 20); const last = appointments.at(-1);
        return { appointments, nextCursor: page.length > 20 ? { startsAt: last.startsAt, reference: last.reference } : null };
      });
    },
    async get(request) {
      await requireLivePatient(auth, request);
      const input = object(request.data, ['patientId', 'appointmentId']);
      const patientId = id(input.patientId); const appointmentId = id(input.appointmentId);
      return run(async () => {
        const result = rows(await store.get({ actorUid: request.auth.uid, patientId, appointmentId }), patientId);
        if (result.length > 1) throw incomplete();
        if (!result.length) throw new HttpsError('not-found', 'This appointment is unavailable.');
        const appointment = project(result[0], patientId);
        if (appointment.id !== appointmentId) throw incomplete();
        return { appointment };
      });
    },
  };
}
function sqlPatientAppointmentStore(dc) {
  const sdk = require('../generated/sql');
  return {
    async list({ actorUid, patientId, cursor }) {
      const response = cursor
        ? await sdk.listLinkedPatientAppointmentsBefore(dc, { actorUid, patientId, beforeStartsAt: cursor.startsAt, beforeReference: cursor.reference })
        : await sdk.listLinkedPatientAppointments(dc, { actorUid, patientId });
      return response.data;
    },
    get: async data => (await sdk.readLinkedPatientAppointment(dc, data)).data,
  };
}
module.exports = { createSqlPatientAppointments, sqlPatientAppointmentStore };
