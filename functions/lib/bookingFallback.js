// TEMPORARY TECHNICAL DEBT (2026-10-25): public booking stays usable while the SQL
// catalogue seed and the Data Connect connector release are blocked. The deployed
// connector predates `ReadSqlCatalogue` and `clinic_settings` has no row, so the SQL
// read fails; public reads then use the legacy Firestore catalogue and
// `clinic/publicConfig`. Writes, slot locking, idempotency, rate limiting and
// authorization never touch this module. Delete it (and `bookingReads` in index.js)
// once the reviewed SQL seed + connector release ships; Firestore is not a supported
// booking data source.
//
// Production path today: reads (`getBookingCatalog`, `getAvailability`) try SQL
// `ReadSqlCatalogue`/`ReadBookingSettings` first and land here only when that read
// throws unavailable/failed-precondition/internal. `getAvailability` still reads
// Firestore `doctors` (embedded weeklySchedule), `doctorSchedules`,
// `scheduleExceptions` and `appointmentSlots` for occupancy. Every booking write
// (`createBooking`, `transitionAppointment`, `reschedule*`, `cancel*`, `closeDay`) is a
// Firestore transaction plus Google Calendar; only `holdAppointment` writes SQL, and
// no client calls it.
// Removal needs all of: a reviewed seed for `clinic_settings` and
// `clinic_services.legacy_id`; a released connector exposing those two reads; verified
// backup/PITR plus a rehearsed rollback; the guest-relation DDL/API review closed; and
// one decided write path, so reads and occupancy cannot split across two stores.
const { HttpsError } = require('firebase-functions/v2/https');

// Only an unusable SQL read falls back. A definitive refusal (unknown doctor, invalid
// selection) still comes from the SQL authority.
const FALLBACK_CODES = new Set(['unavailable', 'failed-precondition', 'internal']);

// The pre-migration published defaults. `clinic/publicConfig` is absent in production,
// so these are exactly what /book served before booking moved to the SQL catalogue.
const DEFAULT_CONFIG = Object.freeze({ bookingWindowDays: 14, leadMinutes: 30, intervalMinutes: 20, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, cancelCutoffHours: 2 });
const DEFAULT_VISIT_TYPES = Object.freeze([
  Object.freeze({ id: 'consultation', label: 'In-clinic consultation', minutes: 20, mode: 'in_person', active: true }),
  Object.freeze({ id: 'video-consultation', label: 'Online video consultation', minutes: 20, mode: 'video', active: true }),
]);
const unavailable = () => new HttpsError('unavailable', 'Booking configuration is temporarily unavailable.');
const text = (value, max) => String(value ?? '').trim().slice(0, max);
const integer = (value, min, max, fallback) => (Number.isInteger(value) && value >= min && value <= max ? value : fallback);

function publishedVisitTypes(value) {
  const rows = Array.isArray(value) && value.length ? value : DEFAULT_VISIT_TYPES;
  if (rows.length > 12) throw unavailable();
  const seen = new Set();
  return rows.map((row) => {
    const id = typeof row?.id === 'string' ? row.id.trim() : '';
    if (!/^[a-z][a-z0-9_-]{1,79}$/.test(id) || seen.has(id)) throw unavailable();
    seen.add(id);
    const label = text(row.label, 100);
    if (!label || !Number.isInteger(row.minutes) || row.minutes < 5 || row.minutes > 240 || !['in_person', 'video'].includes(row.mode)) throw unavailable();
    return { id, label, minutes: row.minutes, mode: row.mode, active: row.active !== false };
  });
}

// Same public shape as `publicCatalogue` in lib/sqlCatalogue.js, from the legacy docs.
function firestoreCatalogue({ branches = [], departments = [], doctors = [] } = {}) {
  const branchIds = new Set();
  const publicBranches = branches.filter((row) => row.active === true).map((row) => {
    branchIds.add(row.id);
    return { id: row.id, name: text(row.name, 120), timezone: row.timezone || 'Asia/Kolkata' };
  });
  const publicDepartments = departments
    .filter((row) => row.active === true && row.publicBookingEnabled === true && branchIds.has(row.branchId))
    .map((row) => ({ id: row.id, branchId: row.branchId, name: text(row.name, 120), description: text(row.description, 300), sortOrder: Number(row.sortOrder) || 0 }));
  const departmentIds = new Set(publicDepartments.map((row) => row.id));
  const publicDoctors = doctors
    .filter((row) => row.active === true && row.bookingEnabled === true && branchIds.has(row.branchId))
    .map((row) => ({ id: row.id, branchId: row.branchId, departmentIds: (Array.isArray(row.departmentIds) ? row.departmentIds : []).filter((id) => departmentIds.has(id)), name: text(row.name, 160), qualification: text(row.qualification, 160) }))
    .filter((row) => row.departmentIds.length);
  return { branches: publicBranches, departments: publicDepartments, doctors: publicDoctors };
}

// Same runtime shape as `bookingSettingsService().runtime()`.
function firestoreConfig(published) {
  const config = published || {};
  const cutoffHours = integer(config.patientCancellationCutoffHours, 0, 168, DEFAULT_CONFIG.cancelCutoffHours);
  return {
    bookingWindowDays: integer(config.bookingWindowDays, 1, 90, DEFAULT_CONFIG.bookingWindowDays),
    leadMinutes: integer(config.leadMinutes, 0, 1440, DEFAULT_CONFIG.leadMinutes),
    intervalMinutes: integer(config.intervalMinutes, 5, 240, DEFAULT_CONFIG.intervalMinutes),
    bufferBeforeMinutes: integer(config.bufferBeforeMinutes, 0, 120, DEFAULT_CONFIG.bufferBeforeMinutes),
    bufferAfterMinutes: integer(config.bufferAfterMinutes, 0, 120, DEFAULT_CONFIG.bufferAfterMinutes),
    cancelCutoffMinutes: cutoffHours * 60,
    autoConfirm: config.autoConfirm === true,
    timezone: 'Asia/Kolkata',
    patientCancellationCutoffHours: cutoffHours,
    visitTypes: publishedVisitTypes(config.visitTypes),
  };
}

async function readWithFallback(sqlRead, fallbackRead) {
  try {
    return await sqlRead();
  } catch (error) {
    if (error instanceof HttpsError && !FALLBACK_CODES.has(error.code)) throw error;
    // Silent masking would hide the SQL outage this fallback exists to survive; the
    // code carries no patient data.
    console.warn('booking_sql_read_fallback', error?.code || error?.name);
    try {
      return await fallbackRead();
    } catch {
      throw error; // the SQL refusal is the meaningful one when both sources fail
    }
  }
}

function createBookingReads({ sql, firestore }) {
  const catalogue = () => readWithFallback(sql.catalogue, firestore.catalogue);
  return {
    catalogue,
    config: () => readWithFallback(sql.config, firestore.config),
    async doctor(doctorId) {
      const doctor = (await catalogue()).doctors.find((row) => row.id === doctorId);
      if (!doctor) throw new HttpsError('not-found', 'This doctor is not currently available for online bookings.');
      return doctor;
    },
  };
}

module.exports = { createBookingReads, firestoreCatalogue, firestoreConfig, DEFAULT_CONFIG, DEFAULT_VISIT_TYPES };
