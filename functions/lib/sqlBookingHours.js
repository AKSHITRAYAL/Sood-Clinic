// SQL schedule reads/writes for the live booking path. Phase 4 cutover: weekly
// hours and date exceptions now have exactly one authority (SQL). The public
// booking reader and the staff editors both use these operations, so Firestore
// `doctorSchedules` / `scheduleExceptions` / embedded `doctors.weeklySchedule`
// are no longer read at runtime.
const { createHash, randomUUID } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { weekdayIst } = require('./ist');

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid = () => new HttpsError('invalid-argument', 'Choose a valid doctor and clinic date.');
const incomplete = () => new HttpsError('failed-precondition', 'The clinic schedule needs review before appointments can be offered.');

const minuteTime = (value) => {
  if (!Number.isInteger(value) || value < 0 || value > 1439) throw incomplete();
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};

function ordered(rows, limit) {
  if (!Array.isArray(rows) || rows.length > limit) throw incomplete();
  let previous = null;
  return rows.map((row) => {
    const start = minuteTime(row?.startMinute); const end = minuteTime(row?.endMinute);
    if (start >= end || (previous && start < previous)) throw incomplete();
    previous = end;
    return { start, end };
  });
}

// One doctor, published for booking, with the explicit schedule-authority marker the
// schedule import writes. A missing marker is reported as unconfigured, never as
// invented default clinic hours.
function project(raw, doctorLegacyId, dateKey) {
  const doctors = raw?.doctors;
  if (!Array.isArray(doctors) || doctors.length !== 1) throw new HttpsError('not-found', 'This doctor is not currently available for online bookings.');
  const doctor = doctors[0];
  if (doctor.legacyId !== doctorLegacyId || doctor.active !== true || doctor.branch?.timezone !== 'Asia/Kolkata'
    || !Array.isArray(doctor.weekly) || !Array.isArray(doctor.exceptions) || doctor.exceptions.length > 1) {
    throw new HttpsError('not-found', 'This doctor is not currently available for online bookings.');
  }
  if (doctor.state?.authority !== 'doctor_schedule' || typeof doctor.state?.updatedAt !== 'string') {
    return { doctorId: doctor.id, configured: false, weeklySessions: [], exception: null, version: null };
  }
  const weekday = weekdayIst(dateKey);
  const weeklySessions = ordered(doctor.weekly, 15).map((window) => ({ weekday, start: window.start, end: window.end }));
  let exception = null;
  if (doctor.exceptions.length) {
    const row = doctor.exceptions[0];
    if (row?.date !== dateKey || !['closed', 'extra', 'replace'].includes(row.kind) || !Array.isArray(row.windows) || row.windows.length > 10) throw incomplete();
    const sessions = ordered(row.windows, 10);
    if (row.kind === 'closed' && sessions.length) throw incomplete();
    exception = { type: row.kind, sessions };
  }
  return { doctorId: doctor.id, configured: true, weeklySessions, exception, version: doctor.state.updatedAt, exceptionId: exception ? doctor.exceptions[0].id : null };
}

function createSqlBookingHours({ dc }) {
  if (!dc) throw new Error('A SQL connection is required for booking hours.');
  const sdk = () => require('../generated/sql');
  async function read({ doctorLegacyId, dateKey }) {
    if (typeof doctorLegacyId !== 'string' || !doctorLegacyId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '')) throw invalid();
    try {
      const { data } = await sdk().readDoctorBookingHours(dc, { doctorLegacyId, date: dateKey, weekday: weekdayIst(dateKey) });
      return project(data, doctorLegacyId, dateKey);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('unavailable', 'Clinic hours could not be loaded. Please retry.');
    }
  }
  return Object.freeze({ read });
}

// closeDay writes the closure to SQL before resolving affected appointments, so a
// date can never stay bookable while cancellations are still pending.
function createSqlClosedDay({ dc }) {
  if (!dc) throw new Error('A SQL connection is required to close a clinic day.');
  const sdk = () => require('../generated/sql');
  async function readState(doctorLegacyId, dateKey) {
    const { data } = await sdk().readDoctorBookingHours(dc, { doctorLegacyId, date: dateKey, weekday: weekdayIst(dateKey) });
    return project(data, doctorLegacyId, dateKey);
  }
  return Object.freeze({
    async close({ actorUid, actorRole, doctorLegacyId, dateKey }) {
      if (typeof actorUid !== 'string' || !actorUid || !['admin', 'doctor'].includes(actorRole)
        || typeof doctorLegacyId !== 'string' || !doctorLegacyId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey || '')) throw invalid();
      let current;
      try { current = await readState(doctorLegacyId, dateKey); }
      catch (error) { if (error instanceof HttpsError) throw error; throw new HttpsError('unavailable', 'The clinic day could not be closed. Please retry.'); }
      if (!current.configured || !UUID.test(current.doctorId || '')) throw incomplete();
      if (current.exception?.type === 'closed') return { closed: true, idempotent: true };
      const requestId = randomUUID();
      const operation = `close_doctor_day:${createHash('sha256').update(JSON.stringify({ actorUid, actorRole, doctorLegacyId, dateKey, version: current.version })).digest('hex')}`;
      try {
        await sdk().closeDoctorDay(dc, {
          actorUid, actorRole, doctorId: current.doctorId, doctorLegacyId, date: dateKey,
          exceptionId: current.exceptionId || randomUUID(), creating: !current.exceptionId, editing: Boolean(current.exceptionId),
          expectedUpdatedAt: current.version, requestId, operation, resourceId: `${doctorLegacyId}/${dateKey}`,
        });
        return { closed: true, idempotent: false };
      } catch (error) {
        // A rejected acknowledgement is not a rollback; re-read before reporting.
        try {
          const after = await readState(doctorLegacyId, dateKey);
          if (after.exception?.type === 'closed') return { closed: true, idempotent: true };
        } catch { /* fall through to the mapped error */ }
        if (typeof error?.message === 'string' && /CLOSED_DAY_VERSION_CHANGED|CLOSED_DAY_DATE_CONFLICT/.test(error.message)) {
          throw new HttpsError('aborted', 'Clinic hours changed. Reload the day before closing it.');
        }
        throw new HttpsError('unavailable', 'The clinic day could not be closed. Please retry.');
      }
    },
  });
}

module.exports = { createSqlBookingHours, createSqlClosedDay, project };
