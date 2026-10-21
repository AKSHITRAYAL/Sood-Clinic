import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

const fail = () => new Error('The clinic day response is unavailable. Refresh before continuing.');
const states = ['scheduled', 'confirmed', 'checked_in', 'in_consultation', 'completed', 'cancelled', 'no_show'];
const instant = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 19) === value.slice(0, 19);
const canonical = value => value.replace(/(?:\.(\d+))?Z$/, (_, fraction = '') => `.${fraction.padEnd(6, '0')}Z`);
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const label = (value, max) => typeof value === 'string' && value.trim() && value.length <= max && ![...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
function cursor(value) {
  if (!value || !instant(value.startsAt) || !label(value.reference, 120)) throw fail();
  return { startsAt: value.startsAt, reference: value.reference };
}
export const sqlClinicDayService = {
  async list(doctorId, clinicDate, nextCursor = null) {
    if (typeof doctorId !== 'string' || !/^[A-Za-z0-9_-]{2,80}$/.test(doctorId) || !date(clinicDate)) throw fail();
    const payload = { doctorId, date: clinicDate, ...(nextCursor ? { cursor: cursor(nextCursor) } : {}) };
    const { data } = await httpsCallable(functions, 'listSqlStaffClinicDay')(payload);
    if (!data || data.doctorId !== doctorId || data.date !== clinicDate || data.timezone !== 'Asia/Kolkata' || !label(data.doctorName, 160)
      || !Array.isArray(data.appointments) || data.appointments.length > 20) throw fail();
    const ids = new Set();
    const appointments = data.appointments.map(row => {
      if (!row || typeof row.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.id)
        || ids.has(row.id.toLowerCase()) || !label(row.reference, 120) || !instant(row.startsAt) || !instant(row.endsAt) || canonical(row.endsAt) <= canonical(row.startsAt)
        || !instant(row.updatedAt) || row.clinicDate !== clinicDate || !states.includes(row.status) || !['in_person', 'video'].includes(row.visitMode)
        || !label(row.branchName, 160) || !label(row.serviceName, 100)) throw fail();
      ids.add(row.id.toLowerCase());
      return { id: row.id, reference: row.reference, startsAt: row.startsAt, endsAt: row.endsAt, updatedAt: row.updatedAt,
        clinicDate, status: row.status, visitMode: row.visitMode, branchName: row.branchName, serviceName: row.serviceName };
    });
    const position = data.nextCursor == null ? null : cursor(data.nextCursor);
    if (position && (!appointments.length || position.startsAt !== appointments.at(-1).startsAt || position.reference !== appointments.at(-1).reference)) throw fail();
    return { doctorId, date: clinicDate, doctorName: data.doctorName, appointments, nextCursor: position, timezone: 'Asia/Kolkata' };
  },
};
