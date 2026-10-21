const { createHash } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { requireLivePatient } = require('./patientAuthorization');
const { requireLiveStaff } = require('./staffAuthorization');
const { toE164 } = require('./phone');
const { istDateKey } = require('./ist');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fields = { displayName: 160, phone: 16, title: 10, dateOfBirth: 10, gender: 30, maritalStatus: 30, addressLine1: 500, city: 100, state: 100, postalCode: 16, emergencyContactName: 160, emergencyContactPhone: 16 };
const invalid = () => new HttpsError('invalid-argument', 'Provide valid patient demographic details.');
const denied = () => new HttpsError('permission-denied', 'This patient profile is not available to your account.');
const unavailable = () => new HttpsError('unavailable', 'The profile change could not be confirmed. Retry unchanged details or reload before editing.');
const stale = () => new HttpsError('aborted', 'Patient details changed. Reload before saving.');
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw invalid();
  return value;
}
function version(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) throw invalid();
  return value.replace(/(?:\.(\d+))?Z$/, (_, fraction = '') => `.${fraction.padEnd(6, '0')}Z`);
}
function canonicalId(value) {
  const id = typeof value === 'string' ? value.replaceAll('-', '').toLowerCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5') : '';
  if (!uuid.test(id)) throw denied();
  return id;
}
function linked(row, patientId) {
  if (!row || !['self', 'guardian'].includes(row.relationship) || !row.verifiedBy || !row.verifiedAt
    || !row.patient || row.patient.archivedAt != null || (patientId && canonicalId(row.patient.id) !== patientId)) throw denied();
  return row;
}
function demographicProfile(patient, patientId) {
  const profile = { patientId, uhid: patient.uhid, updatedAt: version(patient.updatedAt) };
  for (const key of Object.keys(fields)) profile[key] = patient[key] ?? null;
  return profile;
}
function validateProfile(input, now) {
  object(input, Object.keys(fields));
  const profile = {};
  for (const [key, max] of Object.entries(fields)) {
    const value = input[key];
    if (value != null && (typeof value !== 'string' || value.length > max || /[\x00-\x1f\x7f]/.test(value))) throw invalid();
    profile[key] = value?.trim() || null;
  }
  if (!profile.displayName || !/^\+[1-9]\d{7,14}$/.test(profile.phone || '')
    || (profile.emergencyContactPhone && !/^\+[1-9]\d{7,14}$/.test(profile.emergencyContactPhone))) throw invalid();
  for (const [key, allowed] of Object.entries({ title: ['Mr.', 'Mrs.', 'Ms.', 'Dr.'], gender: ['Female', 'Male', 'Non-binary', 'Prefer to self-describe'], maritalStatus: ['Single', 'Married', 'Divorced', 'Widowed'] })) {
    if (profile[key] && !allowed.includes(profile[key])) throw invalid();
  }
  if (profile.dateOfBirth) {
    const date = new Date(`${profile.dateOfBirth}T00:00:00Z`);
    // Date-only value: compare against today's IST date, not the server timezone.
    const today = istDateKey(new Date(now()));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(profile.dateOfBirth) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== profile.dateOfBirth || profile.dateOfBirth > today) throw invalid();
  }
  return profile;
}

const healthFields = ['bloodGroup', 'allergies', 'currentMedications', 'healthNotes'];
function healthProfile(input, validateInput = true) {
  if (validateInput) {
    object(input, healthFields);
    if (healthFields.some(key => !Object.hasOwn(input, key))) throw invalid();
  }
  const profile = {};
  for (const key of healthFields) {
    const value = input[key];
    if (value != null && (typeof value !== 'string' || value.length > (key === 'bloodGroup' ? 3 : 2000))) throw invalid();
    const normalized = validateInput ? value?.replace(/\r\n?/g, '\n').trim() || null : value ?? null;
    if (normalized && /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(normalized)) throw invalid();
    profile[key] = normalized;
  }
  if (profile.bloodGroup && !['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].includes(profile.bloodGroup)) throw invalid();
  return profile;
}

// Local SQL-only service. Do not export callables until the coordinated patient cutover.
function createSqlPatientProfiles({ auth, store, now = Date.now }) {
  async function receipt(data) {
    const saved = await store.receipt({ actorUid: data.actorUid, requestId: data.requestId });
    if (saved && saved !== data.operation) throw new HttpsError('already-exists', 'This request was already used for different details. Reload before saving.');
    return Boolean(saved);
  }
  async function read(data) { return linked(await store.read(data), data.patientId); }
  async function readHealth(data) {
    const row = linked(await store.readHealth(data), data.patientId);
    // A guardian operational link is not evidence of clinical consent.
    if (row.relationship !== 'self') throw denied();
    return row;
  }
  async function readStaff(data) {
    const patient = await store.readStaff(data);
    if (!patient || patient.archivedAt != null || canonicalId(patient.id) !== data.patientId) throw new HttpsError('not-found', 'This patient record is unavailable.');
    return { patient };
  }
  async function saveVersioned(data, readCurrent, commit) {
    const scope = { actorUid: data.actorUid, patientId: data.patientId, ...(data.actorRole ? { actorRole: data.actorRole } : {}) };
    try {
      // Check present access even when replaying a previously committed request.
      const current = await readCurrent(scope);
      if (await receipt(data)) return { saved: true };
      if (version(current.patient.updatedAt) !== data.expectedUpdatedAt) throw stale();
      await commit(data);
      return { saved: true };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      try {
        const current = await readCurrent(scope);
        if (await receipt(data)) return { saved: true };
        if (version(current.patient.updatedAt) !== data.expectedUpdatedAt) throw stale();
      } catch (inspectionError) {
        if (inspectionError instanceof HttpsError && ['permission-denied', 'not-found', 'already-exists', 'aborted'].includes(inspectionError.code)) throw inspectionError;
      }
      throw unavailable();
    }
  }
  function pair(request) {
    if (typeof request.data.patientId !== 'string' || !uuid.test(request.data.patientId)) throw invalid();
    return { actorUid: request.auth.uid, patientId: request.data.patientId.toLowerCase() };
  }
  return {
    async list(request) {
      await requireLivePatient(auth, request, now); object(request.data ?? {}, []);
      try {
        const rows = await store.list({ actorUid: request.auth.uid });
        // shortcut: 20 linked patients per account; add keyset pagination if the clinic needs more.
        if (!Array.isArray(rows) || rows.length > 20) throw new HttpsError('failed-precondition', 'Ask the clinic to review the linked patient list.');
        const patients = rows.map(row => {
          linked(row);
          return { patientId: canonicalId(row.patient.id), uhid: row.patient.uhid, displayName: row.patient.displayName, relationship: row.relationship };
        });
        if (new Set(patients.map(row => row.patientId)).size !== patients.length) throw new HttpsError('failed-precondition', 'Ask the clinic to review the linked patient list.');
        return { patients };
      } catch (error) { if (error instanceof HttpsError) throw error; throw unavailable(); }
    },
    async get(request) {
      await requireLivePatient(auth, request, now); object(request.data, ['patientId']);
      const data = pair(request);
      try {
        const row = await read(data);
        const profile = { ...demographicProfile(row.patient, data.patientId), relationship: row.relationship };
        return { profile };
      } catch (error) { if (error instanceof HttpsError) throw error; throw unavailable(); }
    },
    async save(request) {
      await requireLivePatient(auth, request, now);
      object(request.data, ['patientId', 'requestId', 'expectedUpdatedAt', 'profile']);
      if (typeof request.data.requestId !== 'string' || !uuid.test(request.data.requestId)) throw invalid();
      const data = { ...pair(request), requestId: request.data.requestId.toLowerCase(), expectedUpdatedAt: version(request.data.expectedUpdatedAt), ...validateProfile(request.data.profile, now) };
      data.operation = `patient_demographics:${createHash('sha256').update(JSON.stringify(data)).digest('hex')}`;
      return saveVersioned(data, read, value => store.save(value));
    },
    async getHealth(request) {
      await requireLivePatient(auth, request, now); object(request.data, ['patientId']);
      const data = pair(request);
      try {
        const row = await readHealth(data);
        return { patientId: data.patientId, updatedAt: version(row.patient.updatedAt), profile: healthProfile({ ...row.patient.health, bloodGroup: row.patient.bloodGroup }, false) };
      } catch (error) {
        if (error instanceof HttpsError && error.code === 'permission-denied') throw error;
        throw new HttpsError('unavailable', 'Your health profile could not be loaded. Please retry or contact the clinic.');
      }
    },
    async saveHealth(request) {
      await requireLivePatient(auth, request, now);
      object(request.data, ['patientId', 'requestId', 'expectedUpdatedAt', 'profile']);
      if (typeof request.data.requestId !== 'string' || !uuid.test(request.data.requestId)) throw invalid();
      const data = { ...pair(request), requestId: request.data.requestId.toLowerCase(), expectedUpdatedAt: version(request.data.expectedUpdatedAt), ...healthProfile(request.data.profile) };
      data.operation = `patient_health:${createHash('sha256').update(JSON.stringify(data)).digest('hex')}`;
      return saveVersioned(data, readHealth, value => store.saveHealth(value));
    },
    async searchStaff(request) {
      const actor = await requireLiveStaff(auth, request, { roles: ['admin', 'manager'] });
      const input = object(request.data, ['uhid', 'phone']);
      if (Object.keys(input).length !== 1) throw invalid();
      const kind = Object.hasOwn(input, 'uhid') ? 'uhid' : 'phone';
      if (typeof input[kind] !== 'string' || input[kind].length > 64 || !input[kind].trim()) throw invalid();
      const value = kind === 'uhid' ? input.uhid.trim() : toE164(input.phone);
      if (!value || (kind === 'uhid' && !/^[A-Za-z0-9-]{1,64}$/.test(value))) throw invalid();
      try {
        const rows = await store.searchStaff({ actorUid: actor.uid, actorRole: actor.customClaims.role, kind, value });
        if (!Array.isArray(rows) || rows.length > 20) throw new HttpsError('failed-precondition', 'Too many matches. Search using the exact clinic ID.');
        const patients = rows.map(row => {
          if (!row || row.archivedAt != null || row[kind] !== value || typeof row.displayName !== 'string' || !row.displayName.trim() || typeof row.uhid !== 'string' || !row.uhid.trim() || typeof row.phone !== 'string') throw new HttpsError('failed-precondition', 'The clinic needs to review this patient registry.');
          return { patientId: canonicalId(row.id), uhid: row.uhid, displayName: row.displayName, phone: row.phone };
        });
        if (new Set(patients.map(row => row.patientId)).size !== patients.length || (kind === 'uhid' && patients.length > 1)) throw new HttpsError('failed-precondition', 'The clinic needs to review this patient registry.');
        return { patients };
      } catch (error) { if (error instanceof HttpsError) throw error; throw new HttpsError('unavailable', 'Patient search could not be completed. Please retry.'); }
    },
    async getStaff(request) {
      const actor = await requireLiveStaff(auth, request, { roles: ['admin', 'manager'] });
      object(request.data, ['patientId']);
      const data = { ...pair(request), actorRole: actor.customClaims.role };
      try { return { profile: demographicProfile((await readStaff(data)).patient, data.patientId) }; }
      catch (error) { if (error instanceof HttpsError) throw error; throw new HttpsError('unavailable', 'Patient details could not be loaded. Please retry.'); }
    },
    async saveStaff(request) {
      const actor = await requireLiveStaff(auth, request, { roles: ['admin', 'manager'] });
      object(request.data, ['patientId', 'requestId', 'expectedUpdatedAt', 'profile']);
      if (typeof request.data.requestId !== 'string' || !uuid.test(request.data.requestId)) throw invalid();
      const data = { ...pair(request), actorRole: actor.customClaims.role, requestId: request.data.requestId.toLowerCase(), expectedUpdatedAt: version(request.data.expectedUpdatedAt), ...validateProfile(request.data.profile, now) };
      data.operation = `staff_patient_demographics:${createHash('sha256').update(JSON.stringify(data)).digest('hex')}`;
      return saveVersioned(data, readStaff, value => store.saveStaff(value));
    },
  };
}
function sqlPatientProfileStore(dc) {
  const sdk = require('../generated/sql');
  return {
    list: async data => (await sdk.listLinkedPatientProfiles(dc, data)).data.patientLinks,
    read: async data => (await sdk.readLinkedPatientProfile(dc, data)).data.patientLink,
    receipt: async data => (await sdk.getPatientProfileReceipt(dc, data)).data.operationReceipt?.operation ?? null,
    save: data => sdk.saveLinkedPatientProfile(dc, data),
    async readHealth(data) {
      const response = (await sdk.readLinkedPatientHealth(dc, data)).data;
      if (response.user?.active !== true) throw denied();
      return response.patientLinks[0] ?? null;
    },
    saveHealth: data => sdk.saveLinkedPatientHealth(dc, data),
    async searchStaff({ actorUid, actorRole, kind, value }) {
      const result = kind === 'uhid'
        ? await sdk.searchStaffPatientsByUhid(dc, { actorUid, actorRole, uhid: value })
        : await sdk.searchStaffPatientsByPhone(dc, { actorUid, actorRole, phone: value });
      return result.data.query.patients;
    },
    readStaff: async data => (await sdk.readStaffPatientDemographics(dc, data)).data.query.patient,
    saveStaff: data => sdk.saveStaffPatientDemographics(dc, data),
  };
}
module.exports = { createSqlPatientProfiles, sqlPatientProfileStore };
