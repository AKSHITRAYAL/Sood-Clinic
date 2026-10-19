// Explicit target fields only: timestamp-looking clinical text is never parsed.
const targets = {
  branch: ['Branch', 'id', ['createdAt', 'updatedAt']],
  department: ['Department', 'id', ['createdAt', 'updatedAt']],
  doctor: ['Doctor', 'id', ['createdAt', 'updatedAt']],
  doctorDepartments: ['DoctorDepartment', null, []],
  patient: ['Patient', 'id', ['createdAt', 'updatedAt']],
  patientReportedProfile: ['PatientReportedProfile', 'patientId', []],
  clinicSettings: ['ClinicSettings', 'id', ['createdAt', 'updatedAt']],
  services: ['Service', 'id', ['legacyCreatedAt', 'updatedAt']],
  scheduleState: ['DoctorScheduleState', 'doctorId', ['legacyCreatedAt', 'updatedAt']],
  doctorSchedules: ['DoctorSchedule', 'id', ['updatedAt']],
  scheduleException: ['ScheduleException', 'id', ['legacyCreatedAt', 'updatedAt']],
  exceptionWindows: ['ExceptionWindow', 'id', []],
  appointment: ['Appointment', 'id', ['startsAt', 'endsAt', 'consentAcceptedAt', 'createdAt', 'updatedAt']],
  appointmentEvent: ['AppointmentEvent', 'id', ['occurredAt', 'legacyCreatedAt', 'legacyUpdatedAt']],
  appointmentPrivateDetails: ['AppointmentPrivateDetails', 'appointmentId', ['calendarLastSyncedAt', 'videoPreparedAt', 'videoClearedAt', 'cancellationAt']],
  appointmentLegacySlots: ['AppointmentLegacySlot', 'appointmentId', []],
  legacyMedicalHistory: ['LegacyMedicalHistory', 'id', ['createdAt', 'updatedAt']],
  legacyMedicalDocument: ['LegacyMedicalDocument', 'id', ['createdAt', 'updatedAt']],
  legacyPatientFeedback: ['LegacyPatientFeedback', 'id', ['reviewedAt', 'publishedAt', 'createdAt', 'updatedAt']],
  legacyAuditRecord: ['LegacyAuditRecord', 'id', ['occurredAt', 'legacyCreatedAt', 'legacyUpdatedAt']],
  legacyUhidCounter: ['LegacyUhidCounter', 'id', ['createdAt', 'updatedAt']],
  legacyBookingRequest: ['LegacyBookingRequest', 'id', ['createdAt', 'updatedAt']],
};
function encodeInstant(value) {
  const { timestampNanos } = require('./rehearsal.cjs');
  const nanos = timestampNanos(value);
  let seconds = nanos / 1000000000n;
  if (nanos < 0n && nanos % 1000000000n) seconds -= 1n;
  const fraction = (nanos - seconds * 1000000000n).toString().padStart(9, '0');
  const base = new Date(Number(seconds * 1000n)).toISOString().replace(/\.\d{3}Z$/, '');
  return { sqlValue: `${base}.${fraction.slice(0, 6)}Z`, exactValue: `${base}.${fraction}Z` };
}

function restoreInstant(value) {
  const { timestampNanos } = require('./rehearsal.cjs');
  try {
    if (typeof value?.sqlValue !== 'string' || typeof value?.exactValue !== 'string') throw new Error();
    const encoded = encodeInstant(value.exactValue);
    if (value.exactValue !== encoded.exactValue || timestampNanos(value.sqlValue) !== timestampNanos(encoded.sqlValue)) throw new Error();
    return timestampNanos(value.exactValue);
  } catch { throw new Error('INSTANT_RECONCILIATION_FAILED'); }
}

function prepareMigrationTimestamps(candidate) {
  const { inspectRecord, timestampNanos } = require('./rehearsal.cjs');
  try {
    if (candidate?.status !== 'mapped') return { status: 'rejected', reason: 'NOT_A_MAPPED_CANDIDATE' };
    if (inspectRecord(candidate.source).status === 'rejected' || !candidate.rows || typeof candidate.rows !== 'object') throw new Error();
    const entries = Object.entries(candidate.rows);
    if (entries.some(([alias]) => !Object.hasOwn(targets, alias)) || entries.reduce((n, [, value]) => n + (Array.isArray(value) ? value.length : 1), 0) > 2000) throw new Error();
    const rows = structuredClone(candidate.rows); const instants = []; const keys = new Set();
    const blockers = new Set([...(candidate.blockers || []), ...(candidate.coverage?.fields || []).flatMap(field => field.reason ? [field.reason] : [])]);
    for (const [alias, value] of Object.entries(rows)) {
      const target = targets[alias];
      if (!target) throw new Error();
      const [entityType, identity, fields] = target;
      const items = Array.isArray(value) ? value : [value];
      for (const row of items) {
        if (!row || typeof row !== 'object' || Array.isArray(row) || (identity && (typeof row[identity] !== 'string' || !row[identity] || row[identity].length > 512 || row[identity].includes('\0')))) throw new Error();
        for (const field of fields) {
          if (row[field] === undefined || row[field] === null) continue;
          const encoded = encodeInstant(row[field]);
          const key = JSON.stringify([entityType, row[identity], field]);
          if (keys.has(key) || instants.length >= 512) throw new Error();
          keys.add(key);
          instants.push({ entityType, entityId: row[identity], field, sourcePath: candidate.source.path, ...encoded });
          row[field] = encoded.sqlValue;
        }
      }
    }
    if (rows.appointment && timestampNanos(rows.appointment.endsAt) <= timestampNanos(rows.appointment.startsAt)) blockers.add('NATIVE_INTERVAL_PRECISION_REVIEW');
    if (instants.length) blockers.add('EXACT_TIMESTAMP_TRANSACTION_PENDING');
    rows.legacySourceInstants = instants;
    return { status: 'prepared', readyForApply: false, rows, blockers: [...blockers].sort(), source: structuredClone(candidate.source) };
  } catch { return { status: 'rejected', reason: 'INVALID_TIMESTAMP_CANDIDATE' }; }
}
module.exports = { encodeInstant, restoreInstant, prepareMigrationTimestamps };
