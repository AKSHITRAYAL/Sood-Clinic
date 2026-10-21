const { createHash } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { requireLiveAdmin } = require('./staffAuthorization');
const invalid = () => new HttpsError('invalid-argument', 'Provide valid catalogue fields and a request/version from the current editor.');
const incomplete = () => new HttpsError('failed-precondition', 'The SQL catalogue needs identity/membership reconciliation before use.');
const stale = () => new HttpsError('aborted', 'The catalogue changed. Reload the latest record before saving.');
const unavailable = () => new HttpsError('unavailable', 'Catalogue save could not be confirmed. Retry unchanged details or reload before editing.');
const groups = { branch: 'branches', department: 'departments', doctor: 'doctors' };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const aliasValid = value => typeof value === 'string' && /^[A-Za-z0-9_-]{2,80}$/.test(value);
function uuid(value) {
  if (typeof value !== 'string') throw incomplete();
  const result = value.replaceAll('-', '').toLowerCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
  if (!uuidPattern.test(result)) throw incomplete();
  return result;
}
function version(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) throw invalid();
  return value.replace(/(?:\.(\d+))?Z$/, (_, fraction = '') => `.${fraction.padEnd(6, '0')}Z`);
}
function object(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw invalid();
  return value;
}
function text(value, max, required = true) {
  if (typeof value !== 'string' || value.length > max || /[\x00-\x1f\x7f]/.test(value) || (required && !value.trim())) throw invalid();
  return value.trim();
}

function indexRows(rows, max = 1000) {
  // shortcut: stop above the single-clinic census bound; add consistent pagination before supporting larger catalogues.
  if (!Array.isArray(rows) || rows.length > max) throw incomplete();
  const result = new Map(); const aliases = new Set();
  for (const row of rows) {
    const id = uuid(row.id);
    if (!aliasValid(row.legacyId) || result.has(id) || aliases.has(row.legacyId) || typeof row.active !== 'boolean') throw incomplete();
    result.set(id, row); aliases.add(row.legacyId);
  }
  return result;
}

function projectCatalogue(raw) {
  const branches = indexRows(raw.branches); const departments = indexRows(raw.departments); const doctors = indexRows(raw.doctors);
  if (!Array.isArray(raw.doctorDepartments) || raw.doctorDepartments.length > 12000) throw incomplete();
  const memberships = new Map(); const seen = new Set();
  for (const row of raw.doctorDepartments) {
    const doctorId = uuid(row.doctorId); const departmentId = uuid(row.departmentId);
    const doctor = doctors.get(doctorId); const department = departments.get(departmentId);
    if (!doctor || !department || uuid(doctor.branchId) !== uuid(department.branchId) || seen.has(`${doctorId}/${departmentId}`)) throw incomplete();
    seen.add(`${doctorId}/${departmentId}`);
    const list = memberships.get(doctorId) || [];
    list.push({ id: department.legacyId, sortOrder: row.sortOrder ?? 0 }); memberships.set(doctorId, list);
  }
  const branchAlias = row => {
    const parent = branches.get(uuid(row.branchId)); if (!parent) throw incomplete(); return parent.legacyId;
  };
  return {
    branches: [...branches.values()].map(row => ({ id: row.legacyId, name: row.name, code: row.code, address: row.address, timezone: row.timezone, active: row.active, updatedAt: row.updatedAt })).sort((a, b) => a.name.localeCompare(b.name)),
    departments: [...departments.values()].map(row => ({ id: row.legacyId, branchId: branchAlias(row), name: row.name, code: row.code, description: row.description ?? '', active: row.active, publicBookingEnabled: row.publicBookingEnabled, sortOrder: row.sortOrder, updatedAt: row.updatedAt })).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
    doctors: [...doctors.entries()].map(([id, row]) => ({ id: row.legacyId, branchId: branchAlias(row), departmentIds: (memberships.get(id) || []).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)).map(item => item.id), name: row.name, qualification: row.qualification ?? '', registrationNumber: row.registrationNumber, active: row.active, bookingEnabled: row.bookingEnabled, updatedAt: row.updatedAt })).sort((a, b) => a.name.localeCompare(b.name)),
  };
}

function publicCatalogue(catalogue) {
  const branches = catalogue.branches.filter(row => row.active).map(({ id, name, timezone }) => ({ id, name, timezone }));
  const branchIds = new Set(branches.map(row => row.id));
  const departments = catalogue.departments.filter(row => row.active && row.publicBookingEnabled && branchIds.has(row.branchId)).map(({ id, branchId, name, description, sortOrder }) => ({ id, branchId, name, description, sortOrder }));
  const departmentIds = new Set(departments.map(row => row.id));
  const doctors = catalogue.doctors.filter(row => row.active && row.bookingEnabled && branchIds.has(row.branchId)).map(({ id, branchId, departmentIds: ids, name, qualification }) => ({ id, branchId, departmentIds: ids.filter(id => departmentIds.has(id)), name, qualification })).filter(row => row.departmentIds.length);
  return { branches, departments, doctors };
}

function createSqlCatalogue({ auth, store }) {
  async function read() { return projectCatalogue(await store.read()); }
  async function replay(data) {
    const operation = await store.receipt(data);
    if (operation !== null && operation !== data.operation) throw new HttpsError('already-exists', 'This request was used for different catalogue details. Reload before saving.');
    return operation === data.operation;
  }
  const saved = () => ({ saved: true, message: 'Catalogue saved.' });
  return {
    async get(request) {
      await requireLiveAdmin(auth, request); object(request.data ?? {}, []);
      try { return await read(); } catch (error) { if (error instanceof HttpsError) throw error; throw new HttpsError('unavailable', 'The catalogue could not be loaded. Please retry.'); }
    },
    async public() {
      try { return publicCatalogue(await read()); } catch (error) { if (error instanceof HttpsError) throw error; throw new HttpsError('unavailable', 'The booking catalogue could not be loaded. Please retry.'); }
    },
    async availableDoctor(doctorId) {
      const doctor = (await this.public()).doctors.find(row => row.id === doctorId);
      if (!doctor) throw new HttpsError('not-found', 'This doctor is not currently available for online bookings.');
      return doctor;
    },
    async validateSelection({ branchId, departmentId, doctorId }) {
      const catalogue = await this.public();
      if (!catalogue.doctors.some(row => row.id === doctorId && row.branchId === branchId && row.departmentIds.includes(departmentId))) throw new HttpsError('failed-precondition', 'The selected clinic service is not available.');
    },
    async save(request) {
      const actor = await requireLiveAdmin(auth, request);
      const input = object(request.data, ['action', 'record', 'requestId', 'expectedUpdatedAt']);
      const { action } = input;
      if (!Object.hasOwn(groups, action) || typeof input.requestId !== 'string' || !uuidPattern.test(input.requestId)) throw invalid();
      const keys = ['id', 'name', 'active', ...(action === 'branch' ? ['code', 'address'] : action === 'department' ? ['branchId', 'code', 'description', 'sortOrder', 'publicBookingEnabled'] : ['branchId', 'departmentIds', 'qualification', 'registrationNumber', 'bookingEnabled'])];
      const record = object(input.record, keys);
      if (!aliasValid(record.id) || typeof record.active !== 'boolean') throw invalid();
      const fields = { name: text(record.name, 160), active: record.active };
      if (action !== 'doctor') fields.code = text(record.code, 40);
      if (action === 'branch') fields.address = text(record.address, 500);
      if (action !== 'branch' && !aliasValid(record.branchId)) throw invalid();
      if (action === 'department') {
        if (typeof record.publicBookingEnabled !== 'boolean' || !Number.isInteger(record.sortOrder) || record.sortOrder < 0 || record.sortOrder > 9999) throw invalid();
        Object.assign(fields, { description: text(record.description, 300, false), sortOrder: record.sortOrder, publicBookingEnabled: record.publicBookingEnabled });
      }
      if (action === 'doctor') {
        if (typeof record.bookingEnabled !== 'boolean' || !Array.isArray(record.departmentIds) || record.departmentIds.length < 1 || record.departmentIds.length > 12 || record.departmentIds.some(id => !aliasValid(id)) || new Set(record.departmentIds).size !== record.departmentIds.length) throw invalid();
        Object.assign(fields, { qualification: text(record.qualification, 160, false), registrationNumber: text(record.registrationNumber, 80), bookingEnabled: record.bookingEnabled });
      }
      const expectedUpdatedAt = input.expectedUpdatedAt === null ? null : version(input.expectedUpdatedAt);
      const requestId = input.requestId.toLowerCase();
      const operation = `catalogue:${createHash('sha256').update(JSON.stringify({ actorUid: actor.uid, action, requestId, expectedUpdatedAt, id: record.id, fields, branchId: record.branchId ?? null, departmentIds: record.departmentIds ?? null })).digest('hex')}`;
      const intent = { actorUid: actor.uid, requestId, operation };
      try {
        if (await replay(intent)) return saved();
        const raw = await store.read(); projectCatalogue(raw);
        const current = raw[groups[action]].find(row => row.legacyId === record.id);
        if ((current && (expectedUpdatedAt === null || version(current.updatedAt) !== expectedUpdatedAt)) || (!current && expectedUpdatedAt !== null)) throw stale();
        const naturalKey = action === 'doctor' ? 'registrationNumber' : 'code';
        if (raw[groups[action]].some(row => row.legacyId !== record.id && row[naturalKey] === fields[naturalKey])) throw new HttpsError('already-exists', 'That code or registration number already belongs to another record.');
        const data = { ...intent, action, creating: !current, id: current ? uuid(current.id) : requestId, legacyId: record.id, expectedUpdatedAt, ...fields };
        if (action !== 'branch') {
          const branch = raw.branches.find(row => row.legacyId === record.branchId);
          if (!branch || (current && uuid(current.branchId) !== uuid(branch.id))) throw new HttpsError('failed-precondition', 'Choose the original branch. Archive records instead of reassigning their history.');
          data.branchId = uuid(branch.id);
        }
        if (action === 'doctor') {
          data.departmentIds = record.departmentIds.map(id => {
            const department = raw.departments.find(row => row.legacyId === id);
            if (!department || uuid(department.branchId) !== data.branchId) throw new HttpsError('failed-precondition', 'Every department must belong to the selected branch.');
            return uuid(department.id);
          });
          // shortcut: 12 memberships match the existing editor cap; replace with bulk inputs when the generated SDK supports them.
          for (let index = 0; index < 12; index += 1) data[`member${index}`] = index < data.departmentIds.length;
        }
        await store.save(data); return saved();
      } catch (error) {
        if (error instanceof HttpsError) throw error;
        try {
          if (await replay(intent)) return saved();
          if (expectedUpdatedAt !== null) {
            const current = projectCatalogue(await store.read())[groups[action]].find(row => row.id === record.id);
            if (!current || version(current.updatedAt) !== expectedUpdatedAt) throw stale();
          }
        } catch (inspectionError) {
          if (inspectionError instanceof HttpsError && ['already-exists', 'aborted'].includes(inspectionError.code)) throw inspectionError;
        }
        // A transport failure without a receipt does not prove that a write rolled back.
        if (/CATALOGUE_VERSION_CHANGED/.test(error.message)) throw stale();
        throw unavailable();
      }
    },
  };
}

function sqlCatalogueStore(dc) {
  const sdk = require('../generated/sql');
  return {
    async read() { return (await sdk.readSqlCatalogue(dc)).data; },
    async receipt({ actorUid, requestId }) { return (await sdk.getCatalogueReceipt(dc, { actorUid, requestId })).data.operationReceipt?.operation ?? null; },
    save({ action, creating, ...data }) {
      const operation = `${creating ? 'create' : 'update'}Catalogue${action[0].toUpperCase()}${action.slice(1)}`;
      const keys = ['actorUid', 'requestId', 'operation', 'id', 'legacyId', 'name', 'active', ...(!creating ? ['expectedUpdatedAt'] : []), ...(action === 'branch' ? ['code', 'address'] : action === 'department' ? ['branchId', 'code', 'description', 'sortOrder', 'publicBookingEnabled'] : ['branchId', 'qualification', 'registrationNumber', 'bookingEnabled', 'departmentIds', ...Array.from({ length: 12 }, (_, i) => `member${i}`)])];
      return sdk[operation](dc, Object.fromEntries(keys.map(key => [key, data[key]])));
    },
  };
}
module.exports = { createSqlCatalogue, sqlCatalogueStore, projectCatalogue, publicCatalogue };
