import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { expect, test, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { HttpsError } = require('firebase-functions/v2/https');
const { createSchedulerHoldHandler } = require('../lib/schedulerHoldsCallable');
const { createSqlSchedulerHolds, HOLD_MINUTES } = require('../lib/sqlSchedulerHolds');
const { istInstant } = require('../lib/ist');

// B030: the public hold callable. It is exported as `holdAppointment`, but no client
// calls it yet and nothing is deployed: App Check is enforced and maxInstances is 1.
const DOCTOR_LEGACY = 'brig-ak-sood';
const DOCTOR_UUID = '7f1c2f44-9f3a-4d0b-8b8e-2f6a5c1d3e21';
const REQUEST_UUID = 'b3d0f1a2-4c5e-4f60-9a7b-8c9d0e1f2a3b';
const DATE = '2026-10-26';
const visitType = { minutes: 20, intervalMinutes: 20, minNoticeMinutes: 0, maxAdvanceDays: 180, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 };
const data = (overrides = {}) => ({ doctorId: DOCTOR_LEGACY, dateKey: DATE, time: '10:00', visitTypeId: 'consultation', clientRequestId: REQUEST_UUID, ...overrides });
const request = (overrides = {}) => ({ app: { appId: 'web-app' }, auth: null, data: data(), ...overrides });

const build = ({ held = { holdId: 'token-abcdefghijklmnop', expiresAt: '2026-10-26T02:05:00.000Z', dateKey: DATE, time: '10:00' }, resolved = { doctorId: DOCTOR_UUID, visitType } } = {}) => {
  const holds = { place: vi.fn(async () => held) };
  const resolveDoctor = vi.fn(async () => resolved);
  return { holds, resolveDoctor, handler: createSchedulerHoldHandler({ holds, resolveDoctor }) };
};

test('places a hold for an anonymous guest with server-derived identity', async () => {
  const { holds, resolveDoctor, handler } = build();
  const result = await handler(request());
  expect(resolveDoctor).toHaveBeenCalledWith({ actorUid: 'guest', doctorLegacyId: DOCTOR_LEGACY, visitTypeId: 'consultation', dateKey: DATE });
  expect(holds.place).toHaveBeenCalledWith({
    actorUid: 'guest',
    actorRole: 'patient',
    doctorId: DOCTOR_UUID,
    doctorLegacyId: DOCTOR_LEGACY,
    dateKey: DATE,
    time: '10:00',
    visitType,
    requestId: REQUEST_UUID,
  });
  // The caller gets the token and nothing else.
  expect(result).toEqual({ holdId: 'token-abcdefghijklmnop', expiresAt: '2026-10-26T02:05:00.000Z', dateKey: DATE, time: '10:00' });
});

test('uses the live claim for a signed-in caller and ignores body-supplied identity', async () => {
  const { holds, handler } = build();
  await handler(request({ auth: { uid: 'uid-patient-1', token: { role: 'patient' } }, data: data({ actorUid: 'uid-someone-else', actorRole: 'admin', doctorId: 'brig-ak-sood' }) }));
  expect(holds.place.mock.calls[0][0]).toMatchObject({ actorUid: 'uid-patient-1', actorRole: 'patient' });
  // A staff account placing a public hold keeps its role for the audit row.
  const staff = build();
  await staff.handler(request({ auth: { uid: 'uid-manager', token: { role: 'manager' } } }));
  expect(staff.holds.place.mock.calls[0][0]).toMatchObject({ actorUid: 'uid-manager', actorRole: 'manager' });
});

test('refuses an unverified app before touching the hold service', async () => {
  const { holds, resolveDoctor, handler } = build();
  await expect(handler(request({ app: undefined }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(handler(request({ app: {} }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(handler(request({ app: { appId: '' } }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(handler(request({ app: { appId: 'web-app', alreadyConsumed: true } }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(holds.place).not.toHaveBeenCalled();
  expect(resolveDoctor).not.toHaveBeenCalled();
});

test('rejects malformed requests without calling the hold service', async () => {
  const cases = [
    { doctorId: '' }, { doctorId: 'bad doctor' }, { dateKey: '2026-10-2' }, { time: '25:00' }, { time: '10:0' },
    { clientRequestId: 'not-a-uuid' }, { clientRequestId: '' }, { visitTypeId: 'x'.repeat(65) }, { visitTypeId: 'bad\u0007id' },
    { doctorId: 42 }, { dateKey: null },
  ];
  for (const overrides of cases) {
    const { holds, resolveDoctor, handler } = build();
    await expect(handler(request({ data: data(overrides) })), JSON.stringify(overrides)).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(holds.place).not.toHaveBeenCalled();
    expect(resolveDoctor).not.toHaveBeenCalled();
  }
  // An absent visit type is legitimate (the server picks the default).
  const absent = build();
  await absent.handler(request({ data: data({ visitTypeId: undefined }) }));
  expect(absent.resolveDoctor).toHaveBeenCalledWith({ actorUid: 'guest', doctorLegacyId: DOCTOR_LEGACY, visitTypeId: null, dateKey: DATE });
});

test('refuses a doctor the resolver cannot vouch for', async () => {
  for (const resolved of [
    { doctorId: 'not-a-uuid', visitType },
    { doctorId: DOCTOR_UUID, visitType: null },
    { doctorId: DOCTOR_UUID, visitType: { minutes: 3 } },
    { doctorId: DOCTOR_UUID, visitType: { minutes: 20.5 } },
    { doctorId: DOCTOR_UUID, visitType: { ...visitType, bufferBeforeMinutes: -5 } },
    { doctorId: DOCTOR_UUID, visitType: { ...visitType, bufferAfterMinutes: '5' } },
  ]) {
    const { holds, handler } = build({ resolved });
    await expect(handler(request()), JSON.stringify(resolved)).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(holds.place).not.toHaveBeenCalled();
  }
});

test('passes refusals through and hides infrastructure failures', async () => {
  const taken = new HttpsError('failed-precondition', 'That appointment time is no longer available. Please choose another time.');
  const refusing = createSchedulerHoldHandler({ holds: { place: async () => { throw taken; } }, resolveDoctor: async () => ({ doctorId: DOCTOR_UUID, visitType }) });
  await expect(refusing(request())).rejects.toBe(taken);

  const broken = createSchedulerHoldHandler({ holds: { place: async () => { throw new Error('SQL connect: permission denied on clinic_appointment_units'); } }, resolveDoctor: async () => ({ doctorId: DOCTOR_UUID, visitType }) });
  const error = await broken(request()).catch((thrown) => thrown);
  expect(error.code).toBe('unavailable');
  expect(error.message).toBe('Appointment holds are temporarily unavailable. Please try again.');
  expect(error.message).not.toMatch(/SQL|clinic_appointment_units|permission/i);
});

test('functions/index.js exports the callable with the guarded public-write options', () => {
  // Source inspection only: importing index.js would boot admin and the whole module.
  const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  expect(source).toMatch(/exports\.holdAppointment\s*=\s*onCall\(\{\s*\.\.\.bookingCallableOptions, enforceAppCheck: true, maxInstances: 1,/);
  expect(source).toMatch(/createSchedulerHoldHandler\(\{/);
  expect(source).toMatch(/resolveDoctor: schedulerDoctorIdentity/);
});

test('rejects an incomplete factory instead of failing at request time', () => {
  expect(() => createSchedulerHoldHandler({})).toThrow('A scheduler hold service and a doctor resolver are required.');
  expect(() => createSchedulerHoldHandler({ holds: {}, resolveDoctor: () => {} })).toThrow();
});

test('wires the real hold service: hashed token, buffered units, five-minute expiry', async () => {
  const NOW = new Date('2026-10-26T02:00:00.000Z');
  const claims = { claim: vi.fn(async (payload) => payload) };
  const availability = { getDay: vi.fn(async () => ({ slots: [
    { time: '10:00', startsAt: istInstant(DATE, '10:00'), endsAt: new Date(istInstant(DATE, '10:00').getTime() + 20 * 60_000) },
    { time: '10:20', startsAt: istInstant(DATE, '10:20'), endsAt: new Date(istInstant(DATE, '10:20').getTime() + 20 * 60_000) },
  ] })) };
  const holds = createSqlSchedulerHolds({ availability, claims, now: () => NOW, newHoldId: () => 'hold-token-abcdefghijkl' });
  const handler = createSchedulerHoldHandler({ holds, resolveDoctor: async () => ({ doctorId: DOCTOR_UUID, visitType }) });

  const result = await handler(request());
  expect(result.holdId).toBe('hold-token-abcdefghijkl');
  expect(result.expiresAt).toBe(new Date(NOW.getTime() + HOLD_MINUTES * 60_000).toISOString());

  const payload = claims.claim.mock.calls[0][0];
  expect(payload.units).toHaveLength(4); // 20 minutes on the five-minute grid
  expect(payload.units.every((unit) => unit.kind === 'hold')).toBe(true);
  expect(payload.units[0].unitKey).toBe(`${DOCTOR_LEGACY}_202610261000`);
  expect(payload.units[3].unitKey).toBe(`${DOCTOR_LEGACY}_202610261015`);
  expect(payload.holdHash).toMatch(/^[a-f0-9]{64}$/);
  expect(payload.holdHash).not.toBe(result.holdId);
  expect(JSON.stringify(payload)).not.toContain(result.holdId);
  // The service hands the claim adapter a Date; the adapter normalises it to ISO.
  expect(payload.expiresAt).toBeInstanceOf(Date);
  expect(payload.expiresAt.toISOString()).toBe(result.expiresAt);
  expect(payload.auditAction).toBe('scheduler_hold_placed');
  expect(payload.actorUid).toBe('guest');

  // A time the day does not offer never reaches the claim adapter.
  claims.claim.mockClear();
  const refused = await handler(request({ data: data({ time: '11:00' }) })).then(() => null, (error) => error);
  expect(refused.code).toBe('failed-precondition');
  expect(claims.claim).not.toHaveBeenCalled();
});
