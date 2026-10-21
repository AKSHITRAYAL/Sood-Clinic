import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

const invalid = () => Object.assign(new Error('Select a doctor/date and enter one to four valid special-hours sessions.'), { code: 'functions/invalid-argument' });
const doctor = value => typeof value === 'string' && /^[A-Za-z0-9_-]{2,80}$/.test(value);
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const revision = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
function windows(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) throw invalid();
  const rows = value.map(row => {
    if (!row || !Number.isInteger(row.startMinute) || !Number.isInteger(row.endMinute) || row.startMinute < 0 || row.endMinute > 1439 || row.startMinute >= row.endMinute) throw invalid();
    return { startMinute: row.startMinute, endMinute: row.endMinute };
  }).sort((a, b) => a.startMinute - b.startMinute);
  if (rows.some((row, index) => index && row.startMinute < rows[index - 1].endMinute)) throw invalid();
  return rows;
}
export const sqlSpecialHoursService = {
  async get(doctorId, clinicDate) {
    if (!doctor(doctorId) || !date(clinicDate)) throw invalid();
    const { data } = await httpsCallable(functions, 'getSqlDoctorSpecialHours')({ doctorId, date: clinicDate });
    if (!data || data.doctorId !== doctorId || data.date !== clinicDate || data.timezone !== 'Asia/Kolkata' || !revision(data.updatedAt)
      || typeof data.doctorName !== 'string' || !data.doctorName.trim() || data.doctorName.length > 160 || data.exception === undefined) throw invalid();
    let exception = null;
    if (data.exception !== null) {
      const row = data.exception;
      if (!row || !['extra', 'replace', 'closed'].includes(row.kind) || (row.kind === 'closed' && (!Array.isArray(row.sessions) || row.sessions.length))) throw invalid();
      exception = { kind: row.kind, sessions: row.kind === 'closed' ? [] : windows(row.sessions) };
    }
    return { doctorId, date: clinicDate, doctorName: data.doctorName, timezone: 'Asia/Kolkata', updatedAt: data.updatedAt, exception };
  },
  async save(input) {
    if (!input || !doctor(input.doctorId) || !date(input.date) || !['extra', 'replace'].includes(input.kind) || !revision(input.expectedUpdatedAt)
      || typeof input.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) throw invalid();
    const payload = { doctorId: input.doctorId, date: input.date, kind: input.kind, sessions: windows(input.sessions), expectedUpdatedAt: input.expectedUpdatedAt, requestId: input.requestId };
    const { data } = await httpsCallable(functions, 'saveSqlDoctorSpecialHours')(payload);
    if (data?.saved !== true) throw new Error('The special-hours save could not be confirmed. Reload before editing again.');
    return { saved: true };
  },
};
