import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

const invalid = () => Object.assign(new Error('Enter valid weekly hours and reload the current schedule before saving.'), { code: 'functions/invalid-argument' });
const doctor = value => typeof value === 'string' && /^[A-Za-z0-9_-]{2,80}$/.test(value);
const revision = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
function weekly(value) {
  if (!Array.isArray(value) || value.length > 14) throw invalid();
  const rows = value.map(row => {
    if (!row || !Number.isInteger(row.weekday) || row.weekday < 0 || row.weekday > 6 || !Number.isInteger(row.startMinute)
      || !Number.isInteger(row.endMinute) || row.startMinute < 0 || row.endMinute > 1439 || row.startMinute >= row.endMinute) throw invalid();
    return { weekday: row.weekday, startMinute: row.startMinute, endMinute: row.endMinute };
  }).sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute);
  if (rows.some((row, index) => index && row.weekday === rows[index - 1].weekday && row.startMinute < rows[index - 1].endMinute)) throw invalid();
  return rows;
}
export const sqlWeeklyHoursService = {
  async get(doctorId) {
    if (!doctor(doctorId)) throw invalid();
    const { data } = await httpsCallable(functions, 'getSqlDoctorWeeklyHours')({ doctorId });
    if (!data || data.doctorLegacyId !== doctorId || data.timezone !== 'Asia/Kolkata' || !revision(data.updatedAt)
      || typeof data.doctorName !== 'string' || !data.doctorName.trim() || data.doctorName.length > 160) throw invalid();
    return { doctorId, doctorName: data.doctorName, updatedAt: data.updatedAt, timezone: 'Asia/Kolkata', sessions: weekly(data.sessions) };
  },
  async save(input) {
    if (!input || !doctor(input.doctorId) || !revision(input.expectedUpdatedAt) || typeof input.requestId !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.requestId)) throw invalid();
    const payload = { doctorId: input.doctorId, sessions: weekly(input.sessions), expectedUpdatedAt: input.expectedUpdatedAt, requestId: input.requestId };
    const { data } = await httpsCallable(functions, 'saveSqlDoctorWeeklyHours')(payload);
    if (data?.saved !== true) throw new Error('The weekly-hours save could not be confirmed. Reload before editing again.');
    return { saved: true };
  },
};
