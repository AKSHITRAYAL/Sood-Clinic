const { createHash } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { requireLiveAdmin } = require('./staffAuthorization');
const ranges = { bookingWindowDays: [1, 90], leadMinutes: [0, 1440], intervalMinutes: [5, 240], bufferBeforeMinutes: [0, 120], bufferAfterMinutes: [0, 120], cancelCutoffMinutes: [0, 10080] };
const invalid = () => new HttpsError('invalid-argument', 'Provide valid whole-number booking settings and appointment format details.');
const incomplete = () => new HttpsError('failed-precondition', 'Booking settings need initialization or service identity/buffer review before use.');
const stale = () => new HttpsError('aborted', 'Booking configuration changed. Reload the latest settings and formats before saving.');
const unavailable = () => new HttpsError('unavailable', 'Save could not be confirmed. Retry unchanged details or reload before editing.');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const aliasValid = value => typeof value === 'string' && /^[a-z][a-z0-9_-]{1,79}$/.test(value);
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw invalid();
  return value;
}
function version(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) throw invalid();
  return value.replace(/(?:\.(\d+))?Z$/, (_, fraction = '') => `.${fraction.padEnd(6, '0')}Z`);
}
function validateSettings(input) {
  object(input, [...Object.keys(ranges), 'autoConfirm']);
  const settings = {};
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (!Number.isInteger(input[key]) || input[key] < min || input[key] > max) throw invalid();
    settings[key] = input[key];
  }
  if (typeof input.autoConfirm !== 'boolean') throw invalid();
  settings.autoConfirm = input.autoConfirm;
  return settings;
}
function validateFormat(record) {
  object(record, ['id', 'label', 'minutes', 'mode', 'active']);
  if (!aliasValid(record.id) || typeof record.label !== 'string' || !record.label.trim() || record.label.length > 100 || /[\x00-\x1f\x7f]/.test(record.label) || !Number.isInteger(record.minutes) || record.minutes < 5 || record.minutes > 240 || !['in_person', 'video'].includes(record.mode) || typeof record.active !== 'boolean') throw invalid();
  return { id: record.id, label: record.label.trim(), minutes: record.minutes, mode: record.mode, active: record.active };
}
function canonicalUuid(value) {
  if (typeof value !== 'string') throw incomplete();
  const result = value.replaceAll('-', '').toLowerCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  if (!uuidPattern.test(result)) throw incomplete(); return result;
}
function projectBookingSettings(raw) {
  try {
    if (!raw?.clinicSettings || raw.clinicSettings.id !== 'primary' || !Array.isArray(raw.services) || raw.services.length < 1 || raw.services.length > 12) throw incomplete();
    const settings = validateSettings(Object.fromEntries([...Object.keys(ranges), 'autoConfirm'].map(key => [key, raw.clinicSettings[key]])));
    version(raw.clinicSettings.updatedAt);
    const ids = new Set(); const aliases = new Set();
    const services = raw.services.map(row => {
      const id = canonicalUuid(row.id);
      if (ids.has(id) || aliases.has(row.legacyId) || row.code !== row.legacyId || row.bufferMinutes !== 0 || !Number.isInteger(row.legacySortOrder) || row.legacySortOrder < 0 || row.legacySortOrder > 2147483647) throw incomplete();
      ids.add(id); aliases.add(row.legacyId); version(row.updatedAt);
      return { ...validateFormat({ id: row.legacyId, label: row.name, minutes: row.durationMinutes, mode: row.consultationMode, active: row.active }), order: row.legacySortOrder };
    }).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    if (!services.some(row => row.active)) throw incomplete();
    return { settings, updatedAt: raw.clinicSettings.updatedAt, visitTypes: services.map(({ order, ...row }) => row) };
  } catch { throw incomplete(); }
}
function selectVisitType(config, id) {
  const result = config.visitTypes.find(row => row.id === (id || 'consultation') && row.active);
  if (!result) throw new HttpsError('invalid-argument', 'The selected appointment format is unavailable.');
  return result;
}

function createBookingSettings({ auth, store }) {
  async function read() { return projectBookingSettings(await store.read()); }
  async function replay(data) {
    const operation = await store.receipt(data);
    if (operation !== null && operation !== data.operation) throw new HttpsError('already-exists', 'This request was used for different details. Reload before saving.');
    return operation === data.operation;
  }
  async function save(request, kind) {
    const actor = await requireLiveAdmin(auth, request);
    const input = object(request.data, ['requestId', 'expectedUpdatedAt', kind === 'settings' ? 'settings' : 'record']);
    if (typeof input.requestId !== 'string' || !uuidPattern.test(input.requestId)) throw invalid();
    const expectedUpdatedAt = version(input.expectedUpdatedAt);
    const payload = kind === 'settings' ? validateSettings(input.settings) : validateFormat(input.record);
    const requestId = input.requestId.toLowerCase();
    const operation = `booking_${kind}:${createHash('sha256').update(JSON.stringify({ actorUid: actor.uid, requestId, expectedUpdatedAt, payload })).digest('hex')}`;
    const intent = { actorUid: actor.uid, requestId, operation, expectedUpdatedAt };
    const success = () => ({ saved: true, message: kind === 'settings' ? 'Booking policy saved.' : 'Appointment format saved.' });
    try {
      if (await replay(intent)) return success();
      const raw = await store.read(); const current = projectBookingSettings(raw);
      if (version(current.updatedAt) !== expectedUpdatedAt) throw stale();
      if (kind === 'settings') await store.saveSettings({ ...intent, ...payload });
      else {
        const existing = raw.services.find(row => row.legacyId === payload.id);
        if (existing && existing.consultationMode !== payload.mode) throw new HttpsError('failed-precondition', 'Use a new format for a different delivery mode; existing appointments retain their original mode.');
        if (!existing && current.visitTypes.length >= 12) throw new HttpsError('failed-precondition', 'The clinic supports at most twelve retained appointment formats.');
        if (!payload.active && !current.visitTypes.some(row => row.id !== payload.id && row.active)) throw new HttpsError('failed-precondition', 'Keep at least one appointment format available.');
        const sortOrder = existing?.legacySortOrder ?? Math.max(...raw.services.map(row => row.legacySortOrder)) + 1;
        if (sortOrder > 2147483647) throw new HttpsError('failed-precondition', 'Format display order needs review before adding another format.');
        await store.saveService({ ...intent, creating: !existing, id: existing ? canonicalUuid(existing.id) : requestId, legacyId: payload.id, name: payload.label, durationMinutes: payload.minutes, consultationMode: payload.mode, active: payload.active, sortOrder, expectedServiceUpdatedAt: existing?.updatedAt ?? null });
      }
      return success();
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      try {
        if (await replay(intent)) return success();
        if (version((await read()).updatedAt) !== expectedUpdatedAt) throw stale();
      } catch (inspectionError) {
        if (inspectionError instanceof HttpsError && ['already-exists', 'aborted'].includes(inspectionError.code)) throw inspectionError;
      }
      if (/BOOKING_CONFIG_VERSION_CHANGED|BOOKING_SERVICE_VERSION_CHANGED/.test(error.message)) throw stale();
      throw unavailable();
    }
  }
  return {
    async get(request) {
      await requireLiveAdmin(auth, request); object(request.data ?? {}, []);
      try { return await read(); } catch (error) { if (error instanceof HttpsError) throw error; throw new HttpsError('unavailable', 'Booking settings could not be loaded.'); }
    },
    async runtime() {
      let data;
      try { data = await read(); } catch (error) { if (error instanceof HttpsError) throw error; throw new HttpsError('unavailable', 'Booking configuration is temporarily unavailable.'); }
      return { ...data.settings, timezone: 'Asia/Kolkata', patientCancellationCutoffHours: data.settings.cancelCutoffMinutes / 60, visitTypes: data.visitTypes };
    },
    saveSettings: request => save(request, 'settings'),
    saveService: request => save(request, 'service'),
  };
}
function sqlBookingSettingsStore(dc) {
  const sdk = require('../generated/sql');
  return {
    async read() { return (await sdk.readBookingSettings(dc)).data; },
    async receipt({ actorUid, requestId }) { return (await sdk.getBookingSettingsReceipt(dc, { actorUid, requestId })).data.operationReceipt?.operation ?? null; },
    saveSettings: data => sdk.saveBookingSettings(dc, data),
    saveService({ creating, ...data }) {
      const keys = ['actorUid', 'requestId', 'operation', 'expectedUpdatedAt', 'id', 'legacyId', 'name', 'durationMinutes', 'consultationMode', 'active', ...(creating ? ['sortOrder'] : ['expectedServiceUpdatedAt'])];
      return sdk[creating ? 'createBookingService' : 'updateBookingService'](dc, Object.fromEntries(keys.map(key => [key, data[key]])));
    },
  };
}
module.exports = { createBookingSettings, sqlBookingSettingsStore, projectBookingSettings, selectVisitType };
