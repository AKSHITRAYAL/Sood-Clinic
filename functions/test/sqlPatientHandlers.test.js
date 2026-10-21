import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { beforeEach, expect, test, vi } from 'vitest';
const require = createRequire(import.meta.url);
const profilesApi = { list: vi.fn(), get: vi.fn(), save: vi.fn(), getHealth: vi.fn(), saveHealth: vi.fn(), searchStaff: vi.fn(), getStaff: vi.fn(), saveStaff: vi.fn() };
const appointmentsApi = { list: vi.fn(), get: vi.fn() };
const linkingApi = { issue: vi.fn(), revoke: vi.fn(), accept: vi.fn() };
const requireLivePatient = vi.fn(async () => ({ uid: 'synthetic-patient' }));

// The handlers module is CommonJS loaded through Node's real require, which vitest
// cannot intercept; inject isolated factory fakes into the module cache instead.
function inject(id, exports) {
  const module = { id: require.resolve(id), exports, loaded: true, children: [], paths: [] };
  require.cache[module.id] = module;
}
inject('../lib/sqlPatientProfiles', { createSqlPatientProfiles: vi.fn(() => profilesApi), sqlPatientProfileStore: vi.fn(() => 'profile-store') });
inject('../lib/sqlPatientAppointments', { createSqlPatientAppointments: vi.fn(() => appointmentsApi), sqlPatientAppointmentStore: vi.fn(() => 'appointment-store') });
inject('../lib/patientLinking', { createPatientLinking: vi.fn(() => linkingApi), sqlPatientLinkStore: vi.fn(() => 'link-store') });
inject('../lib/patientAuthorization', { requireLivePatient });
const { createSqlPatientHandlers, sqlPatientCallableOptions } = require('../lib/sqlPatientHandlers');

const handlerNames = ['acceptSqlPatientLink', 'getSqlPatientAppointment', 'getSqlPatientHealth', 'getSqlPatientProfile', 'getSqlStaffPatientProfile', 'issueSqlPatientLink', 'listSqlPatientAppointments', 'listSqlPatientProfiles', 'revokeSqlPatientLink', 'saveSqlPatientHealth', 'saveSqlPatientProfile', 'saveSqlStaffPatientProfile', 'searchSqlStaffPatients'];
const request = (patch = {}) => ({ auth: { uid: 'synthetic-patient', token: { email_verified: true, auth_time: 100 } }, data: { patientId: 'synthetic' }, app: { appId: 'synthetic-app' }, ...patch });
const handlers = createSqlPatientHandlers({ auth: {}, dc: {}, checkLinkAttempt: vi.fn(async () => true) });

beforeEach(() => { for (const api of [profilesApi, appointmentsApi, linkingApi]) for (const fn of Object.values(api)) fn.mockReset().mockResolvedValue('ok'); requireLivePatient.mockReset().mockResolvedValue({ uid: 'synthetic-patient' }); });

test('handler names are fixed, frozen and match the staged frontend endpoints', () => {
  expect(Object.keys(handlers).sort()).toEqual(handlerNames);
  expect(Object.isFrozen(handlers)).toBe(true);
});

test('callable options are frozen and strict', () => {
  expect(Object.isFrozen(sqlPatientCallableOptions)).toBe(true);
  expect(sqlPatientCallableOptions).toEqual({ region: 'asia-south1', enforceAppCheck: true, maxInstances: 1, timeoutSeconds: 30, memory: '256MiB' });
});

test('trusted request.app context is required; data.app spoof and consumed context fail closed', async () => {
  for (const spoof of [request({ app: undefined }), request({ app: {} }), request({ app: { appId: '' } }), request({ app: { appId: 'synthetic-app', alreadyConsumed: true } }), request({ app: undefined, data: { app: { appId: 'spoofed' } } })]) {
    await expect(handlers.listSqlPatientProfiles(spoof)).rejects.toMatchObject({ code: 'failed-precondition' });
    await expect(handlers.acceptSqlPatientLink(spoof)).rejects.toMatchObject({ code: 'failed-precondition' });
  }
  expect(profilesApi.list).not.toHaveBeenCalled();
  expect(requireLivePatient).not.toHaveBeenCalled();
  await handlers.getSqlPatientProfile(request());
  expect(profilesApi.get).toHaveBeenCalledWith(request());
});

test('acceptSqlPatientLink debits only after live patient auth and never forwards the code', async () => {
  const checkLinkAttempt = vi.fn(async () => true);
  const guarded = createSqlPatientHandlers({ auth: {}, dc: {}, checkLinkAttempt });
  const req = request({ data: { code: 'C'.repeat(43) } });
  await expect(guarded.acceptSqlPatientLink(req)).resolves.toBe('ok');
  expect(requireLivePatient).toHaveBeenCalled();
  expect(checkLinkAttempt).toHaveBeenCalledWith({ actorUid: 'synthetic-patient', appId: 'synthetic-app' });
  expect(Object.keys(checkLinkAttempt.mock.calls[0][0]).sort()).toEqual(['actorUid', 'appId']);
  expect(linkingApi.accept).toHaveBeenCalledWith(req);
});

test('abuse-guard outcomes fail closed and a missing guard disables linking', async () => {
  for (const [guard, code] of [[vi.fn(async () => { throw new Error('guard down'); }), 'unavailable'], [vi.fn(async () => false), 'resource-exhausted'], [vi.fn(async () => 'yes'), 'resource-exhausted'], [vi.fn(async () => 1), 'resource-exhausted']]) {
    const guarded = createSqlPatientHandlers({ auth: {}, dc: {}, checkLinkAttempt: guard });
    await expect(guarded.acceptSqlPatientLink(request())).rejects.toMatchObject({ code });
    expect(linkingApi.accept).not.toHaveBeenCalled();
  }
  const missing = createSqlPatientHandlers({ auth: {}, dc: {} });
  await expect(missing.acceptSqlPatientLink(request())).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(linkingApi.accept).not.toHaveBeenCalled();
});

test('live patient auth runs before any attempt is consumed', async () => {
  const checkLinkAttempt = vi.fn(async () => true);
  const guarded = createSqlPatientHandlers({ auth: {}, dc: {}, checkLinkAttempt });
  requireLivePatient.mockRejectedValue(Object.assign(new Error('denied'), { code: 'permission-denied' }));
  await expect(guarded.acceptSqlPatientLink(request())).rejects.toMatchObject({ code: 'permission-denied' });
  expect(checkLinkAttempt).not.toHaveBeenCalled();
  expect(linkingApi.accept).not.toHaveBeenCalled();
});

test('no staged handler is exported from functions/index.js', () => {
  const source = readFileSync(require.resolve('../index.js'), 'utf8');
  for (const name of handlerNames) expect(source).not.toMatch(new RegExp(`exports\\.${name}\\b`));
});
