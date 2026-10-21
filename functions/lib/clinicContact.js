const { createHash } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { requireLiveAdmin } = require('./staffAuthorization');
const invalid = () => new HttpsError('invalid-argument', 'Provide a clinic name, international phone, email and address within the displayed limits.');
const unavailable = () => new HttpsError('unavailable', 'The save could not be confirmed. Retry unchanged details to check it safely, or reload before editing again.');
const stale = () => new HttpsError('aborted', 'Clinic details changed in another session. Reload the latest details before saving.');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw invalid();
  return value;
}
function text(value, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) throw invalid();
  return value.trim();
}
function version(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) throw invalid();
  // Keep PostgreSQL microseconds intact; Date is used only to validate the calendar.
  return value.replace(/(?:\.(\d+))?Z$/, (_, fraction = '') => `.${fraction.padEnd(6, '0')}Z`);
}

function createClinicContact({ auth, store }) {
  async function receipt(data) {
    const saved = await store.receipt(data);
    if (saved && saved !== data.operation) throw new HttpsError('already-exists', 'This request was already used for different details. Reload before saving.');
    return Boolean(saved);
  }
  const success = () => ({ saved: true, message: 'Clinic contact saved. Public pages refresh their cached details within five minutes.' });
  return {
    async get(request) {
      await requireLiveAdmin(auth, request);
      object(request.data ?? {}, []);
      try {
        const profile = await store.read();
        if (!profile) throw new HttpsError('failed-precondition', 'Clinic contact has not been initialized.');
        return { profile };
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        throw new HttpsError('unavailable', 'Clinic contact could not be loaded. Please retry.');
      }
    },
    async save(request) {
      const actor = await requireLiveAdmin(auth, request);
      const input = object(request.data, ['requestId', 'expectedUpdatedAt', 'profile']);
      const profile = object(input.profile, ['name', 'phone', 'email', 'address']);
      if (typeof input.requestId !== 'string' || !uuid.test(input.requestId)) throw invalid();
      const data = {
        requestId: input.requestId.toLowerCase(), actorUid: actor.uid,
        expectedUpdatedAt: version(input.expectedUpdatedAt),
        name: text(profile.name, 160), phone: text(profile.phone, 16),
        email: text(profile.email, 254), address: text(profile.address, 500), timezone: 'Asia/Kolkata',
      };
      if (!/^\+[1-9]\d{7,14}$/.test(data.phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw invalid();
      data.operation = `clinic_contact:${createHash('sha256').update(JSON.stringify(data)).digest('hex')}`;
      try {
        if (await receipt(data)) return success();
        const current = await store.read();
        if (!current) throw new HttpsError('failed-precondition', 'Clinic contact has not been initialized.');
        if (version(current.updatedAt) !== data.expectedUpdatedAt) throw stale();
        await store.save(data);
        return success();
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        try {
          if (await receipt(data)) return success();
          const current = await store.read();
          if (current && version(current.updatedAt) !== data.expectedUpdatedAt) throw stale();
        } catch (inspectionError) {
          if (inspectionError instanceof HttpsError && ['already-exists', 'aborted'].includes(inspectionError.code)) throw inspectionError;
        }
        throw unavailable();
      }
    },
  };
}

function sqlClinicContactStore(dc) {
  const sdk = require('../generated/sql');
  return {
    async read() { return (await sdk.getAdminClinicContact(dc)).data.clinicProfile; },
    async receipt(data) { return (await sdk.getClinicContactReceipt(dc, { actorUid: data.actorUid, requestId: data.requestId })).data.operationReceipt?.operation ?? null; },
    save: data => sdk.saveClinicContact(dc, data),
  };
}
module.exports = { createClinicContact, sqlClinicContactStore };
