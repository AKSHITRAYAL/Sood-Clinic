import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

const fields = ['title', 'displayName', 'phone', 'dateOfBirth', 'gender', 'maritalStatus', 'addressLine1', 'city', 'state', 'postalCode', 'emergencyContactName', 'emergencyContactPhone'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isId = value => typeof value === 'string' && uuid.test(value);
const isVersion = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value) && Number.isFinite(Date.parse(value));
const invalid = () => new Error('Patient registry details could not be confirmed. Reload before continuing.');
const pick = (value, keys) => Object.fromEntries(keys.map(key => {
  if (value[key] != null && typeof value[key] !== 'string') throw invalid();
  return [key, value[key] ?? ''];
}));

export const sqlStaffPatientService = {
  async search(kind, value) {
    if (!['uhid', 'phone'].includes(kind) || typeof value !== 'string' || !value.trim() || value.length > 64) throw invalid();
    const { data } = await httpsCallable(functions, 'searchSqlStaffPatients')({ [kind]: value.trim() });
    if (!Array.isArray(data?.patients) || data.patients.length > 20) throw invalid();
    const patients = data.patients.map(row => {
      if (!isId(row?.patientId) || !row.uhid || !row.displayName) throw invalid();
      return { patientId: row.patientId, ...pick(row, ['uhid', 'displayName', 'phone']) };
    });
    if (new Set(patients.map(row => row.patientId)).size !== patients.length) throw invalid();
    return patients;
  },
  async getProfile(patientId) {
    if (!isId(patientId)) throw invalid();
    const { data } = await httpsCallable(functions, 'getSqlStaffPatientProfile')({ patientId });
    const row = data?.profile;
    if (row?.patientId !== patientId || !row.uhid || !isVersion(row.updatedAt)) throw invalid();
    return { patientId, uhid: row.uhid, updatedAt: row.updatedAt, ...pick(row, fields) };
  },
  async saveProfile({ patientId, profile, expectedUpdatedAt, requestId }) {
    if (!isId(patientId) || !isId(requestId) || !isVersion(expectedUpdatedAt) || !profile || fields.some(key => !Object.hasOwn(profile, key))) throw invalid();
    const { data } = await httpsCallable(functions, 'saveSqlStaffPatientProfile')({ patientId, profile: pick(profile, fields), expectedUpdatedAt, requestId });
    if (data?.saved !== true) throw invalid();
    return { saved: true };
  },
};
