// One-off import of the published doctor schedule from Firestore into the SQL
// schedule authority (weekly hours, date exceptions, schedule-state marker).
// Preview by default; `--apply` writes one transaction and refuses an unexpected
// target. Only clinic configuration is read: no patient, appointment or clinical row.
const { randomUUID } = require('node:crypto');
const { cloudSql } = require('./cloud.cjs');
const auth = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { Client } = require('firebase-tools/lib/apiv2');

const PROJECT = 'sood-clinic';
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const minutes = (value) => {
  if (!TIME.test(value || '')) throw new Error('Unreadable clinic time in the published schedule.');
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
};

const unescape = (value) => (value?.stringValue ?? value?.integerValue ?? value?.booleanValue);

async function firestoreClient() {
  const options = { project: PROJECT, projectRoot: process.cwd(), nonInteractive: true };
  const account = auth.getProjectDefaultAccount(process.cwd());
  if (!account) throw new Error('Sign in to the Firebase CLI before importing the schedule.');
  auth.setActiveAccount(options, account);
  await requireAuth(options);
  return new Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1', auth: true });
}

async function readConfig(client, path) {
  try {
    const result = await client.get(`/projects/${PROJECT}/databases/(default)/documents/${path}`, { queryParams: { pageSize: 100 } });
    return result.body.documents || [];
  } catch (error) {
    if (String(error.message).includes('404')) return [];
    throw error;
  }
}

// `doctorSchedules.sessions` is authoritative when the document exists; the embedded
// `doctors.weeklySchedule` list is the pre-migration source for the same doctor.
function weeklySessions({ scheduleDoc, doctorDoc }) {
  if (scheduleDoc) {
    const rows = scheduleDoc.fields?.sessions?.arrayValue?.values || [];
    return rows.map((row) => {
      const field = row.mapValue?.fields || {};
      return { weekday: Number(unescape(field.weekday)), start: minutes(unescape(field.start ?? field.startTime)), end: minutes(unescape(field.end ?? field.endTime)) };
    });
  }
  const rows = doctorDoc?.fields?.weeklySchedule?.arrayValue?.values || [];
  return rows.map((row) => {
    const field = row.mapValue?.fields || {};
    return { weekday: Number(unescape(field.weekday)), start: minutes(unescape(field.startTime)), end: minutes(unescape(field.endTime)) };
  });
}

function validateSessions(rows) {
  const seen = new Map();
  rows.forEach((row) => {
    if (!Number.isInteger(row.weekday) || row.weekday < 0 || row.weekday > 6 || !Number.isInteger(row.start) || !Number.isInteger(row.end) || row.start < 0 || row.end > 1439 || row.start >= row.end) {
      throw new Error('The published weekly hours contain an invalid weekday or time range.');
    }
    const list = seen.get(row.weekday) || [];
    if (list.some((other) => row.start < other.end && row.end > other.start)) throw new Error('The published weekly hours overlap on one weekday.');
    list.push(row); seen.set(row.weekday, list);
  });
  return rows.slice().sort((left, right) => left.weekday - right.weekday || left.start - right.start);
}

function exceptions(rows) {
  return rows.map((doc) => {
    const field = doc.fields || {};
    const legacyId = String(unescape(field.doctorId) || '');
    const dateKey = String(unescape(field.dateKey) || doc.name.split('/').pop().slice(-10));
    const type = String(unescape(field.type));
    if (!legacyId || !DATE.test(dateKey) || !['closed', 'extra', 'replace'].includes(type)) throw new Error('A published date exception is unreadable.');
    const sessions = (field.sessions?.arrayValue?.values || []).map((row) => {
      const window = row.mapValue?.fields || {};
      return { start: minutes(unescape(window.start)), end: minutes(unescape(window.end)) };
    });
    if (type === 'closed' && sessions.length) throw new Error('A closed date exception has clinic hours.');
    sessions.sort((left, right) => left.start - right.start);
    if (sessions.some((row, index) => index && row.start < sessions[index - 1].end)) throw new Error('A date exception has overlapping hours.');
    return { legacyId, dateKey, type, sessions };
  }).sort((left, right) => left.dateKey.localeCompare(right.dateKey));
}

async function plan() {
  const client = await firestoreClient();
  const [doctorDocs, scheduleDocs, exceptionDocs] = await Promise.all([
    readConfig(client, 'doctors'),
    readConfig(client, 'doctorSchedules'),
    readConfig(client, 'scheduleExceptions'),
  ]);
  const byDoctor = new Map(scheduleDocs.map((doc) => [doc.name.split('/').pop(), doc]));
  const doctors = doctorDocs.map((doc) => {
    const legacyId = doc.name.split('/').pop();
    const rows = validateSessions(weeklySessions({ scheduleDoc: byDoctor.get(legacyId), doctorDoc: doc }));
    return { legacyId, sessions: rows };
  }).filter((doctor) => doctor.sessions.length > 0 || byDoctor.has(doctor.legacyId));
  const allExceptions = exceptions(exceptionDocs);
  return { doctors, exceptions: allExceptions };
}

async function apply({ doctors, exceptions: rows }) {
  if (!doctors.length) throw new Error('No published doctor schedule to import.');
  const identities = await cloudSql([`SELECT id, legacy_id FROM clinic_doctors WHERE legacy_id IN (${doctors.map((doctor) => `'${doctor.legacyId.replace(/[^A-Za-z0-9_-]/g, '')}'`).join(',')})`]);
  const byLegacy = new Map(identities[0].rows.map((row) => [row.legacy_id, row.id]));
  if (doctors.some((doctor) => !byLegacy.has(doctor.legacyId))) throw new Error('A published doctor has no SQL catalogue identity; reconcile the catalogue before importing.');
  const existing = await cloudSql([`SELECT (SELECT count(*) FROM clinic_doctor_schedule_states) AS states, (SELECT count(*) FROM clinic_doctor_schedules) AS weekly, (SELECT count(*) FROM clinic_schedule_exceptions) AS exceptions`]);
  const counts = existing[0].rows[0];
  if (Number(counts.states) || Number(counts.weekly) || Number(counts.exceptions)) {
    throw new Error('The SQL schedule already has rows. Importing again is not safe; review the target instead.');
  }
  const statements = [];
  doctors.forEach((doctor) => {
    const id = byLegacy.get(doctor.legacyId);
    statements.push(`INSERT INTO clinic_doctor_schedule_states(doctor_id, authority, legacy_source_path, updated_at) VALUES('${id}', 'doctor_schedule', 'doctors/${doctor.legacyId}', now())`);
    doctor.sessions.forEach((row, index) => {
      statements.push(`INSERT INTO clinic_doctor_schedules(doctor_id, weekday, start_minute, end_minute, source_order, updated_at) VALUES('${id}', ${row.weekday}, ${row.start}, ${row.end}, ${index}, now())`);
    });
  });
  rows.forEach((row) => {
    const doctor = doctors.find((item) => item.legacyId === row.legacyId);
    if (!doctor) throw new Error('A date exception belongs to an unpublished doctor; review the schedule before importing.');
    const doctorId = byLegacy.get(doctor.legacyId);
    const exceptionId = randomUUID();
    statements.push(`INSERT INTO clinic_schedule_exceptions(id, doctor_id, date, kind, updated_at) VALUES('${exceptionId}', '${doctorId}', '${row.dateKey}', '${row.type}', now())`);
    row.sessions.forEach((window, index) => {
      statements.push(`INSERT INTO clinic_exception_windows(exception_id, start_minute, end_minute, source_order) VALUES('${exceptionId}', ${window.start}, ${window.end}, ${index})`);
    });
    statements.push(`INSERT INTO clinic_audit_logs(actor_role, action, resource_type, resource_id, occurred_at) VALUES('system', 'doctor_schedule_imported', 'doctor_schedule', '${doctor.legacyId}/${row.dateKey}', now())`);
  });
  const auditDoctors = doctors.map((doctor) => `('system', 'doctor_schedule_imported', 'doctor_schedule', '${doctor.legacyId}', now())`).join(',');
  if (auditDoctors) statements.push(`INSERT INTO clinic_audit_logs(actor_role, action, resource_type, resource_id, occurred_at) VALUES ${auditDoctors}`);
  await cloudSql(statements, { transaction: true });
  const verified = await cloudSql([`SELECT (SELECT count(*) FROM clinic_doctor_schedule_states) AS states, (SELECT count(*) FROM clinic_doctor_schedules) AS weekly, (SELECT count(*) FROM clinic_schedule_exceptions) AS exceptions, (SELECT count(*) FROM clinic_exception_windows) AS windows`]);
  return verified[0].rows[0];
}

module.exports = { plan, apply };

if (require.main === module) {
  const args = process.argv.slice(2);
  (async () => {
    if (args.some((argument) => !['--apply', '--preview'].includes(argument))) throw new Error('Only --preview or --apply are accepted.');
    const data = await plan();
    const summary = {
      doctors: data.doctors.map((doctor) => ({ legacyId: doctor.legacyId, sessions: doctor.sessions.length })),
      exceptions: data.exceptions.map((row) => ({ legacyId: row.legacyId, dateKey: row.dateKey, kind: row.type, windows: row.sessions.length })),
    };
    console.log('PREVIEW', JSON.stringify(summary));
    if (!args.includes('--apply')) { console.log('No writes. Re-run with --apply after a verified backup.'); return; }
    const counts = await apply(data);
    console.log('APPLIED', JSON.stringify(counts));
  })().catch((error) => { console.error('IMPORT_REFUSED', error.message); process.exitCode = 1; });
}
