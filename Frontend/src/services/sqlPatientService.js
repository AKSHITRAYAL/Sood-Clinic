import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

const demographics = ['title', 'displayName', 'phone', 'dateOfBirth', 'gender', 'maritalStatus', 'addressLine1', 'city', 'state', 'postalCode', 'emergencyContactName', 'emergencyContactPhone'];
const health = ['bloodGroup', 'allergies', 'currentMedications', 'healthNotes'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid = () => new Error('Patient information could not be confirmed. Reload before continuing.');
const isId = value => typeof value === 'string' && uuid.test(value);
const isVersion = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value) && Number.isFinite(Date.parse(value));
const safeFields = (row, fields) => Object.fromEntries(fields.map(key => {
  if (row[key] != null && typeof row[key] !== 'string') throw invalid();
  return [key, row[key] ?? ''];
}));
async function call(name, payload) {
  // No legacy fallback: a missing SQL endpoint must not split patient stores.
  return (await httpsCallable(functions, name)(payload)).data;
}
async function save(name, { patientId, profile, expectedUpdatedAt, requestId }, fields) {
  if (!isId(patientId) || !isId(requestId) || !isVersion(expectedUpdatedAt) || !profile || fields.some(key => !Object.hasOwn(profile, key))) throw invalid();
  const result = await call(name, { patientId, profile: safeFields(profile, fields), expectedUpdatedAt, requestId });
  if (result?.saved !== true) throw invalid();
  return { saved: true };
}
function appointment(row) {
  if (!row || !isId(row.id) || !isVersion(row.startsAt) || !isVersion(row.endsAt) || row.timezone !== 'Asia/Kolkata'
    || !['in_person', 'video'].includes(row.visitMode) || !['scheduled', 'confirmed', 'checked_in', 'in_consultation', 'completed', 'cancelled', 'no_show'].includes(row.status)) throw invalid();
  return { id: row.id, ...safeFields(row, ['reference', 'startsAt', 'endsAt', 'clinicDate', 'status', 'visitMode', 'updatedAt', 'doctorName', 'branchName', 'branchAddress', 'serviceName']), timezone: 'Asia/Kolkata' };
}
export const sqlPatientService = {
  async listPatients() {
    const result = await call('listSqlPatientProfiles', {});
    if (!Array.isArray(result?.patients) || result.patients.length > 20) throw invalid();
    const patients = result.patients.map(row => {
      if (!isId(row?.patientId) || !['self', 'guardian'].includes(row.relationship) || !row.displayName || !row.uhid) throw invalid();
      return { patientId: row.patientId, ...safeFields(row, ['displayName', 'uhid', 'relationship']) };
    });
    if (new Set(patients.map(row => row.patientId)).size !== patients.length) throw invalid();
    return patients;
  },
  async getProfile(patientId) {
    if (!isId(patientId)) throw invalid();
    const result = (await call('getSqlPatientProfile', { patientId }))?.profile;
    if (result?.patientId !== patientId || !isVersion(result.updatedAt) || !['self', 'guardian'].includes(result.relationship)) throw invalid();
    return { patientId, updatedAt: result.updatedAt, relationship: result.relationship, uhid: result.uhid, ...safeFields(result, demographics) };
  },
  saveProfile: data => save('saveSqlPatientProfile', data, demographics),
  async getHealth(patientId) {
    if (!isId(patientId)) throw invalid();
    const result = await call('getSqlPatientHealth', { patientId });
    if (result?.patientId !== patientId || !isVersion(result.updatedAt) || !result.profile) throw invalid();
    return { patientId, updatedAt: result.updatedAt, profile: safeFields(result.profile, health) };
  },
  saveHealth: data => save('saveSqlPatientHealth', data, health),
  async appointments(patientId, cursor = null) {
    if (!isId(patientId) || (cursor && (!isVersion(cursor.startsAt) || typeof cursor.reference !== 'string' || !cursor.reference || cursor.reference.length > 120))) throw invalid();
    const payload = { patientId, ...(cursor ? { cursor: { startsAt: cursor.startsAt, reference: cursor.reference } } : {}) };
    const result = await call('listSqlPatientAppointments', payload);
    if (!Array.isArray(result?.appointments) || result.appointments.length > 20) throw invalid();
    const next = result.nextCursor;
    if (next != null && (!isVersion(next.startsAt) || typeof next.reference !== 'string' || !next.reference || next.reference.length > 120)) throw invalid();
    return { appointments: result.appointments.map(appointment), nextCursor: next ? { startsAt: next.startsAt, reference: next.reference } : null };
  },
  async acceptLink(code) {
    if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code)) throw new Error('Enter the complete clinic-issued code.');
    const result = await call('acceptSqlPatientLink', { code });
    if (result?.linked !== true) throw invalid();
    return { linked: true };
  },
};
