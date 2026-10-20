const { createRequire } = require('node:module');
const { localDataConnect } = require('./local.cjs');
const { encodeInspectionSource } = require('../migration/protected-reader.cjs');
const toolsRequire = createRequire(require.resolve('firebase-tools/package.json'));
const { Client } = toolsRequire('pg');
// Domain migration scope only: no Auth, staff, links/invitations, receipts or live audit export.
const tables = {
  Branch: 'clinic_branches', Department: 'clinic_departments', Doctor: 'clinic_doctors', DoctorDepartment: 'clinic_doctor_departments',
  Patient: 'clinic_patients', PatientReportedProfile: 'clinic_patient_reported_profiles', Service: 'clinic_services', ClinicSettings: 'clinic_settings',
  DoctorScheduleState: 'clinic_doctor_schedule_states', DoctorSchedule: 'clinic_doctor_schedules', ScheduleException: 'clinic_schedule_exceptions', ExceptionWindow: 'clinic_exception_windows',
  Appointment: 'clinic_appointments', AppointmentEvent: 'clinic_appointment_events', AppointmentPrivateDetails: 'clinic_appointment_private_details', AppointmentLegacySlot: 'clinic_appointment_legacy_slots',
  LegacySourceInstant: 'clinic_legacy_source_instants', LegacyMedicalHistory: 'clinic_legacy_medical_history', LegacyMedicalDocument: 'clinic_legacy_medical_documents',
  LegacyPatientFeedback: 'clinic_legacy_patient_feedback', LegacyAuditRecord: 'clinic_legacy_audit_records', LegacyUhidCounter: 'clinic_legacy_uhid_counters', LegacyBookingRequest: 'clinic_legacy_booking_requests',
};
const camel = value => value.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
async function captureLocalTargets(key) {
  localDataConnect();
  if (process.env.FIREBASE_DATACONNECT_POSTGRESQL_STRING || !Buffer.isBuffer(key) || key.length !== 32) throw new Error('LOCAL_SNAPSHOT_REJECTED');
  const sql = new Client({ host: '127.0.0.1', port: 9398, database: 'ak-sood-clinic-database', user: 'postgres' });
  try {
    await sql.connect();
    await sql.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const snapshot = { complete: true, tables: Object.keys(tables), rows: [] }; const counts = {};
    for (const [entityType, table] of Object.entries(tables)) {
      const columns = (await sql.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position", [table])).rows;
      const keys = (await sql.query("SELECT k.column_name FROM information_schema.table_constraints c JOIN information_schema.key_column_usage k ON k.constraint_schema=c.constraint_schema AND k.constraint_name=c.constraint_name AND k.table_name=c.table_name WHERE c.table_schema='public' AND c.table_name=$1 AND c.constraint_type='PRIMARY KEY' ORDER BY k.ordinal_position", [table])).rows.map(row => row.column_name);
      if (!columns.length || columns.length > 128 || !keys.length || keys.some(key => !columns.some(column => column.column_name === key)) || columns.some(column => !/^[a-z][a-z0-9_]*$/.test(column.column_name)) || new Set(columns.map(column => camel(column.column_name))).size !== columns.length) throw new Error();
      const selection = columns.map(({ column_name: name, data_type: type }) => {
        let expression = `"${name}"`;
        if (type === 'timestamp with time zone') expression = `to_char("${name}" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
        else if (type === 'date') expression = `to_char("${name}", 'YYYY-MM-DD')`;
        else if (!['text', 'character varying', 'uuid', 'integer', 'smallint', 'bigint', 'boolean'].includes(type)) throw new Error();
        return `${expression} AS "${camel(name)}"`;
      });
      const rows = (await sql.query(`SELECT ${selection.join(',')} FROM "${table}" ORDER BY ${keys.map(key => `"${key}"`).join(',')} LIMIT $1`, [10001 - snapshot.rows.length])).rows;
      if (snapshot.rows.length + rows.length > 10000) throw new Error();
      counts[entityType] = rows.length;
      for (const content of rows) snapshot.rows.push({ entityType, key: keys.map(key => content[camel(key)]), version: content.updatedAt ?? null, content });
    }
    const encrypted = encodeInspectionSource([], { contentSnapshot: snapshot }, key);
    await sql.query('COMMIT');
    return { encrypted, counts, mode: 'local_target_snapshot', productionReady: false };
  } catch {
    await sql.query('ROLLBACK').catch(() => {});
    throw new Error('LOCAL_SNAPSHOT_REJECTED');
  } finally { await sql.end().catch(() => {}); }
}
module.exports = { captureLocalTargets };
