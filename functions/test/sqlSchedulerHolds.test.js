import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { expect, test, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { HttpsError } = require('firebase-functions/v2/https');
const { HOLD_MINUTES, createSqlSchedulerHolds } = require('../lib/sqlSchedulerHolds');
const { istInstant } = require('../lib/ist');

// B029: the hold orchestrator with injected availability/claim adapters and a fixed
// clock/token, so every unit below is deterministic.
const DOCTOR_LEGACY = 'brig-ak-sood';
const DOCTOR_UUID = '7f1c2f44-9f3a-4d0b-8b8e-2f6a5c1d3e21';
const REQUEST_UUID = 'b3d0f1a2-4c5e-4f60-9a7b-8c9d0e1f2a3b';
const DATE = '2026-10-26';
const NOW = new Date('2026-10-26T02:00:00.000Z');
const TOKEN = 'hold-token-abcdefghijkl';
const sha = (value) => createHash('sha256').update(value).digest('hex');
const visitType = { minutes: 20, intervalMinutes: 20, minNoticeMinutes: 0, maxAdvanceDays: 180, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 };
const slot = (time, duration = 20) => ({ time, startsAt: istInstant(DATE, time), endsAt: new Date(istInstant(DATE, time).getTime() + duration * 60_000) });

const build = ({ slots = [slot('10:00'), slot('10:20')], claim, newHoldId } = {}) => {
  const availability = { getDay: vi.fn(async () => ({ dateKey: DATE, slots })) };
  const claims = { claim: claim || vi.fn(async (payload) => payload) };
  const holds = createSqlSchedulerHolds({ availability, claims, now: () => NOW, newHoldId: newHoldId || (() => TOKEN) });
  return { availability, claims, holds };
};
const place = (holds, overrides = {}) => holds.place({
  actorUid: 'uid-patient-1', actorRole: 'patient', doctorId: DOCTOR_UUID, doctorLegacyId: DOCTOR_LEGACY,
  dateKey: DATE, time: '10:00', visitType, requestId: REQUEST_UUID, ...overrides,
});

test('derives the hold, claims the buffered unit range and returns only the token', async () => {
  const { availability, claims, holds } = build();
  const result = await place(holds);

  expect(availability.getDay).toHaveBeenCalledTimes(1);
  expect(availability.getDay.mock.calls[0][0]).toEqual({ actorUid: 'uid-patient-1', doctorLegacyId: DOCTOR_LEGACY, dateKey: DATE, visitType });

  const payload = claims.claim.mock.calls[0][0];
  expect(payload.units).toHaveLength(4);
  expect(payload.units.map((unit) => unit.kind)).toEqual(['hold', 'hold', 'hold', 'hold']);
  expect(payload.units.map((unit) => unit.unitKey)).toEqual([
    `${DOCTOR_LEGACY}_202610261000`, `${DOCTOR_LEGACY}_202610261005`, `${DOCTOR_LEGACY}_202610261010`, `${DOCTOR_LEGACY}_202610261015`,
  ]);
  expect(payload.units[0].unitAt.toISOString()).toBe('2026-10-26T04:30:00.000Z');
  expect(payload.auditAction).toBe('scheduler_hold_placed');
  expect(payload.actorUid).toBe('uid-patient-1');
  expect(payload.requestId).toBe(REQUEST_UUID);
  expect(payload.now).toBe(NOW);

  // Only the hash reaches the adapter, and the raw token is the caller's alone.
  expect(payload.holdHash).toBe(sha(TOKEN));
  expect(result.holdId).toBe(TOKEN);
  expect(Object.keys(result).sort()).toEqual(['dateKey', 'expiresAt', 'holdId', 'time']);
  const serialized = JSON.stringify(payload, (_key, value) => (value instanceof Date ? value.toISOString() : value));
  expect(serialized).not.toContain(TOKEN);
});

test('buffers widen the claimed range and the slot duration does not', async () => {
  const { claims, holds } = build();
  await place(holds, { visitType: { ...visitType, bufferBeforeMinutes: 5, bufferAfterMinutes: 10 } });
  const payload = claims.claim.mock.calls[0][0];
  expect(payload.units.map((unit) => unit.unitKey)).toEqual([
    `${DOCTOR_LEGACY}_202610260955`, `${DOCTOR_LEGACY}_202610261000`, `${DOCTOR_LEGACY}_202610261005`, `${DOCTOR_LEGACY}_202610261010`,
    `${DOCTOR_LEGACY}_202610261015`, `${DOCTOR_LEGACY}_202610261020`, `${DOCTOR_LEGACY}_202610261025`,
  ]);
  expect(payload.units[0].unitAt.toISOString()).toBe('2026-10-26T04:25:00.000Z');
  expect(payload.units[6].unitAt.toISOString()).toBe('2026-10-26T04:55:00.000Z');
});

test('the hold expires exactly five minutes after the clock', async () => {
  const { claims, holds } = build();
  const result = await place(holds);
  const expected = new Date(NOW.getTime() + HOLD_MINUTES * 60_000);
  expect(HOLD_MINUTES).toBe(5);
  expect(result.expiresAt).toBe(expected.toISOString());
  expect(claims.claim.mock.calls[0][0].expiresAt.toISOString()).toBe(expected.toISOString());
  expect(claims.claim.mock.calls[0][0].expiresAt.toISOString()).toBe('2026-10-26T02:05:00.000Z');
});

test('refuses a time the day does not offer without claiming anything', async () => {
  const { availability, claims, holds } = build({ slots: [slot('09:00')] });
  const error = await place(holds, { time: '10:00' }).then(() => null, (thrown) => thrown);
  expect(error).toBeInstanceOf(HttpsError);
  expect(error.code).toBe('failed-precondition');
  expect(error.message).toMatch(/no longer available/);
  expect(claims.claim).not.toHaveBeenCalled();
  expect(availability.getDay).toHaveBeenCalledTimes(1);
});

test('rejects malformed actor, doctor, time and buffer inputs before any read', async () => {
  const cases = [
    ['missing actor', { actorUid: '' }],
    ['missing role', { actorRole: '' }],
    ['actor is not a string', { actorUid: 7 }],
    ['doctor id is not a UUID', { doctorId: 'not-a-uuid' }],
    ['missing doctor id', { doctorId: '' }],
    ['missing legacy id', { doctorLegacyId: '' }],
    ['malformed legacy id', { doctorLegacyId: 'bad doctor' }],
    ['hour out of range', { time: '24:00' }],
    ['unpadded time', { time: '10:0' }],
    ['seconds in the time', { time: '10:00:00' }],
    ['negative buffer', { visitType: { ...visitType, bufferBeforeMinutes: -1 } }],
    ['fractional buffer', { visitType: { ...visitType, bufferAfterMinutes: 2.5 } }],
    ['non-numeric buffer', { visitType: { ...visitType, bufferBeforeMinutes: '5' } }],
  ];
  for (const [name, overrides] of cases) {
    const { availability, claims, holds } = build();
    await expect(place(holds, overrides), name).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(availability.getDay, name).not.toHaveBeenCalled();
    expect(claims.claim, name).not.toHaveBeenCalled();
  }
});

test('rejects a bad hold token and a bad clock instead of issuing a hold', async () => {
  for (const newHoldId of [() => 'short', () => 'has spaces in the token', () => 'x'.repeat(65)]) {
    const { claims, holds } = build({ newHoldId });
    await expect(place(holds)).rejects.toThrow('Hold generator must return a secure URL-safe token.');
    expect(claims.claim).not.toHaveBeenCalled();
  }

  const { claims } = build();
  const broken = createSqlSchedulerHolds({ availability: { getDay: async () => ({ slots: [] }) }, claims, now: () => new Date('nope'), newHoldId: () => TOKEN });
  await expect(place(broken)).rejects.toThrow('Scheduler clock must return a valid Date.');
  expect(claims.claim).not.toHaveBeenCalled();
});

test('requires both adapters at construction', () => {
  expect(() => createSqlSchedulerHolds({})).toThrow('Complete scheduler availability and claim adapters are required.');
  expect(() => createSqlSchedulerHolds({ availability: { getDay: async () => ({ slots: [] }) } })).toThrow();
  expect(() => createSqlSchedulerHolds({ availability: { getDay: async () => ({ slots: [] }) }, claims: {} })).toThrow();
});

test('propagates a claim refusal instead of reporting a hold', async () => {
  const taken = new HttpsError('failed-precondition', 'SCHEDULER_SLOT_TAKEN');
  const { holds } = build({ claim: async () => { throw taken; } });
  await expect(place(holds)).rejects.toBe(taken);
});

test('the caller can place a hold on the slot it is holding', async () => {
  // ownHoldHash is deliberately not sent by place: the availability read must
  // still report the slot as bookable only while no other live hold owns it.
  const { availability, holds } = build();
  await place(holds);
  expect(availability.getDay.mock.calls[0][0]).not.toHaveProperty('ownHoldHash');
});
