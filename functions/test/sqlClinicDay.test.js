import { createRequire } from 'node:module';
import { expect, test, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { createSqlClinicDay, sqlClinicDayCallableOptions } = require('../lib/sqlClinicDay');

const legacyId = 'DOC-71';
const otherLegacy = 'DOC-72';
const doctorRowId = 'b0000000-0000-4000-8000-000000000001';
const date = '2026-10-20';
const base = '2026-10-20T04:30:00.123456Z';
const appt = patch => ({
  id: 'a0000000-0000-4000-8000-000000000001', doctorId: doctorRowId, reference: 'SYNTHETIC-DAY-001',
  startsAt: base, endsAt: '2026-10-20T05:00:00.123456Z', clinicDate: date, status: 'confirmed',
  visitMode: 'in_person', updatedAt: base, branch: { name: 'Synthetic Clinic', timezone: 'Asia/Kolkata' },
  service: { name: 'Consultation' }, ...patch,
});
const day = appointments => [{ id: doctorRowId, legacyId, name: 'Synthetic Doctor', appointments }];

function setup({ role = 'admin', claims, storeRead } = {}) {
  const user = { uid: 'staff-actor', disabled: false, customClaims: claims ?? { role }, tokensValidAfterTime: null };
  const auth = { getUser: vi.fn(async () => user) };
  const store = { read: storeRead ?? vi.fn(async () => day([appt()])) };
  const service = createSqlClinicDay({ auth, store });
  const doctorToken = user.customClaims.doctorId ? { doctorId: user.customClaims.doctorId } : {};
  const request = data => ({ auth: { uid: user.uid, token: { role: user.customClaims.role, auth_time: Math.floor(Date.now() / 1000), ...doctorToken } }, data, app: { appId: 'synthetic-app' } });
  return { user, auth, store, service, request };
}

test('trusted app context is required before any input, auth or store work', async () => {
  const { store, service, request } = setup();
  const base = request({ doctorId: legacyId, date });
  for (const patch of [{ app: undefined }, { app: {} }, { app: { appId: '' } }, { app: { appId: 'synthetic-app', alreadyConsumed: true } }]) {
    await expect(service.list({ ...base, ...patch })).rejects.toMatchObject({ code: 'failed-precondition' });
  }
  const spoofed = { auth: base.auth, app: undefined, data: { doctorId: legacyId, date, app: { appId: 'spoofed' } } };
  await expect(service.list(spoofed)).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(store.read).not.toHaveBeenCalled();
});

test('doctor, date and cursor inputs are strictly validated before staff auth', async () => {
  const { store, service, request } = setup();
  for (const data of [
    { doctorId: legacyId, date, extra: true },
    { doctorId: 'x', date },
    { doctorId: legacyId, date: '2026-10-3' },
    { doctorId: legacyId, date: '2026-13-99' },
    { doctorId: legacyId, date: '2026-02-30' },
    { doctorId: legacyId },
    { doctorId: legacyId, date, cursor: { startsAt: base, reference: 'X', extra: 1 } },
    { doctorId: legacyId, date, cursor: { startsAt: 'bad', reference: 'X' } },
    { doctorId: legacyId, date, cursor: { startsAt: base, reference: '' } },
    { doctorId: legacyId, date, cursor: { startsAt: base, reference: 'r'.repeat(121) } },
    { doctorId: legacyId, date, cursor: { startsAt: '2026-10-19T04:30:00.123456Z', reference: 'SYNTHETIC-DAY-001' } },
  ]) {
    await expect(service.list(request(data))).rejects.toMatchObject({ code: 'invalid-argument' });
  }
  expect(store.read).not.toHaveBeenCalled();
});

test('live staff gates: disabled, mismatched doctor scope, wrong role and future sessions fail before SQL', async () => {
  const disabled = setup();
  disabled.user.disabled = true;
  await expect(disabled.service.list(disabled.request({ doctorId: legacyId, date }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(disabled.store.read).not.toHaveBeenCalled();

  const scoped = setup({ role: 'doctor', claims: { role: 'doctor', doctorId: otherLegacy } });
  await expect(scoped.service.list(scoped.request({ doctorId: legacyId, date }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(scoped.store.read).not.toHaveBeenCalled();

  const own = setup({ role: 'doctor', claims: { role: 'doctor', doctorId: legacyId } });
  await own.service.list(own.request({ doctorId: legacyId, date }));
  expect(own.store.read).toHaveBeenCalledWith(expect.objectContaining({ actorRole: 'doctor' }));

  const future = setup();
  const request = future.request({ doctorId: legacyId, date });
  request.auth.token.auth_time = Math.floor(Date.now() / 1000) + 600;
  await expect(future.service.list(request)).rejects.toMatchObject({ code: 'permission-denied' });
  expect(future.store.read).not.toHaveBeenCalled();
});

test('a valid page returns only operational fields with microsecond-normalised timestamps', async () => {
  const storeRead = vi.fn()
    .mockResolvedValueOnce(day([appt({ startsAt: '2026-10-20T04:30:00.1Z', updatedAt: '2026-10-20T04:31:00Z' })]))
    .mockResolvedValueOnce(day([appt({ startsAt: '2026-10-20T05:30:00.000000Z', endsAt: '2026-10-20T06:00:00.000000Z', reference: 'SYNTHETIC-DAY-002', updatedAt: '2026-10-20T05:31:00Z' })]));
  const { store, service, request } = setup({ storeRead });
  const result = await service.list(request({ doctorId: legacyId, date }));
  expect(Object.keys(result).sort()).toEqual(['appointments', 'date', 'doctorId', 'doctorName', 'nextCursor', 'timezone'].sort());
  expect(result).toMatchObject({ doctorId: legacyId, doctorName: 'Synthetic Doctor', date, timezone: 'Asia/Kolkata', nextCursor: null });
  expect(Object.keys(result.appointments[0]).sort()).toEqual(['branchName', 'clinicDate', 'endsAt', 'id', 'reference', 'serviceName', 'startsAt', 'status', 'updatedAt', 'visitMode'].sort());
  expect(result.appointments[0].startsAt).toBe('2026-10-20T04:30:00.100000Z');
  expect(result.appointments[0].updatedAt).toBe('2026-10-20T04:31:00.000000Z');
  expect(JSON.stringify(result)).not.toMatch(/patient|reason|phone|email/i);
  expect(store.read).toHaveBeenCalledWith({ actorUid: 'staff-actor', actorRole: 'admin', doctorId: legacyId, date, cursor: null });
  const cursor = { startsAt: '2026-10-20T04:30:00.100000Z', reference: 'SYNTHETIC-DAY-001' };
  await service.list(request({ doctorId: legacyId, date, cursor }));
  expect(store.read).toHaveBeenLastCalledWith({ actorUid: 'staff-actor', actorRole: 'admin', doctorId: legacyId, date, cursor });
});

test('missing, mismatched, duplicate, unordered or malformed day rows fail closed', async () => {
  for (const doctors of [
    [],
    [{ id: doctorRowId, legacyId: 'OTHER', name: 'Synthetic Doctor', appointments: [appt()] }],
    day([appt(), appt()]),
    day(Array(22).fill(null).map((_, i) => appt({ id: `a0000000-0000-4000-8000-${String(i).padStart(12, '0')}`, reference: `SYNTHETIC-DAY-${String(i).padStart(3, '0')}`, startsAt: `2026-10-20T04:${String(i).padStart(2, '0')}:00.000000Z` }))),
  ]) {
    const { service, request } = setup({ storeRead: async () => doctors });
    await expect(service.list(request({ doctorId: legacyId, date }))).rejects.toMatchObject({ code: 'failed-precondition' });
  }
  for (const patch of [{ status: 'invented' }, { visitMode: 'phone' }, { clinicDate: '2026-10-19' }, { doctorId: '00000000-0000-4000-8000-000000000009' }, { branch: { name: 'Synthetic Clinic', timezone: 'UTC' } }, { branch: null }, { service: null }, { endsAt: base }, { endsAt: '2026-10-20T04:00:00.000000Z' }, { startsAt: '2026-10-19T10:00:00.000000Z' }, { reference: '' }, { reference: 7 }, { updatedAt: 'bad' }, { id: 'not-a-uuid' }]) {
    const { service, request } = setup({ storeRead: async () => day([appt(patch)]) });
    await expect(service.list(request({ doctorId: legacyId, date }))).rejects.toMatchObject({ code: 'failed-precondition' });
  }
  const unordered = setup({ storeRead: async () => day([appt({ startsAt: '2026-10-20T05:30:00.000000Z', reference: 'SYNTHETIC-DAY-002' }), appt()]) });
  await expect(unordered.service.list(unordered.request({ doctorId: legacyId, date }))).rejects.toMatchObject({ code: 'failed-precondition' });
  const atCursor = setup({ storeRead: async () => day([appt()]) });
  await expect(atCursor.service.list(atCursor.request({ doctorId: legacyId, date, cursor: { startsAt: base, reference: 'SYNTHETIC-DAY-001' } }))).rejects.toMatchObject({ code: 'failed-precondition' });
  const broken = setup({ storeRead: async () => { throw Error('private SQL detail'); } });
  await expect(broken.service.list(broken.request({ doctorId: legacyId, date }))).rejects.toMatchObject({ code: 'unavailable', message: expect.not.stringContaining('private') });
});

test('the 21-row sentinel page returns 20 rows and a keyset cursor from the last row', async () => {
  const rows = Array(21).fill(null).map((_, i) => appt({ id: `a0000000-0000-4000-8000-${String(i).padStart(12, '0')}`, reference: `SYNTHETIC-DAY-${String(i).padStart(3, '0')}`, startsAt: `2026-10-20T04:${String(i).padStart(2, '0')}:00.000000Z`, endsAt: `2026-10-20T04:${String(i).padStart(2, '0')}:30.000000Z` }));
  const { store, service, request } = setup({ storeRead: vi.fn(async () => day(rows)) });
  const page = await service.list(request({ doctorId: legacyId, date }));
  expect(page.appointments).toHaveLength(20);
  expect(page.nextCursor).toEqual({ startsAt: '2026-10-20T04:19:00.000000Z', reference: 'SYNTHETIC-DAY-019' });
  expect(store.read).toHaveBeenCalledTimes(1);
});

test('strict callable options are reused and frozen', () => {
  expect(Object.isFrozen(sqlClinicDayCallableOptions)).toBe(true);
  expect(sqlClinicDayCallableOptions).toMatchObject({ region: 'asia-south1', enforceAppCheck: true, maxInstances: 1 });
});
