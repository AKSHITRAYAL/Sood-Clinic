import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { expect, test, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { UNIT_CLAIM_LIMIT, claimVariables, createSqlSchedulerClaims, holdHash, sqlSchedulerClaimStore } = require('../lib/sqlSchedulerClaims');

// B028: the unmounted Phase 6 claim adapter, exercised with a fake store only.
const DOCTOR_UUID = '7f1c2f44-9f3a-4d0b-8b8e-2f6a5c1d3e21';
const REQUEST_UUID = 'b3d0f1a2-4c5e-4f60-9a7b-8c9d0e1f2a3b';
const APPOINTMENT_UUID = 'c4e1a2b3-5d6f-4a70-8b8c-9d0e1f2a3b4c';
const NOW = new Date('2026-10-26T02:00:00.000Z');
const HOLD_ID = 'Zm9vYmFyYmF6cXV4MTIz';
const holdHashOf = (value) => createHash('sha256').update(value).digest('hex');
const UNIT_KEY = 'brig-ak-sood_202610261000';
const UNIT_AT = '2026-10-26T04:30:00.000Z';

const base = {
  actorUid: 'uid-guest-1',
  actorRole: 'patient',
  doctorId: DOCTOR_UUID,
  doctorLegacyId: 'brig-ak-sood',
  requestId: REQUEST_UUID,
  auditAction: 'appointment_booked',
  units: [{ unitKey: UNIT_KEY, unitAt: UNIT_AT, kind: 'core' }],
  now: NOW,
};
// Exactly one of appointmentId / holdHash may be set, so each fixture supplies its own.
const coreClaim = (overrides = {}) => ({ ...base, appointmentId: APPOINTMENT_UUID, ...overrides });
const holdClaim = (overrides = {}) => ({
  ...base,
  units: [{ unitKey: UNIT_KEY, unitAt: UNIT_AT, kind: 'hold' }],
  holdHash: holdHashOf(HOLD_ID),
  expiresAt: '2026-10-26T02:10:00.000Z',
  ...overrides,
});
const holdOverride = (overrides) => ({ appointmentId: null, ...overrides });

test('pads every claim to 96 primitive units with matching slot flags', () => {
  const variables = claimVariables(coreClaim());
  expect(UNIT_CLAIM_LIMIT).toBe(96);
  expect(variables.unitKeys).toHaveLength(96);
  expect(variables.unitAts).toHaveLength(96);
  expect(variables.kinds).toHaveLength(96);
  // The compiler needs flat primitive arrays, so the flags must match the padding exactly.
  expect(Object.keys(variables).filter((key) => /^slot\d+$/.test(key))).toHaveLength(96);
  expect(variables.slot0).toBe(true);
  for (let index = 1; index < 96; index += 1) expect(variables[`slot${index}`]).toBe(false);
  expect(variables.unitKeys.slice(1, 3)).toEqual([`__scheduler_unused_${REQUEST_UUID}_0`, `__scheduler_unused_${REQUEST_UUID}_1`]);
  expect(variables.unitAts.slice(1)).toEqual(Array(95).fill(NOW.toISOString()));
  expect(variables.kinds.slice(1)).toEqual(Array(95).fill('hold'));
});

test('keeps server-computed unit values and normalizes the caller identifiers', () => {
  const variables = claimVariables(coreClaim({ doctorId: DOCTOR_UUID.toUpperCase(), requestId: REQUEST_UUID.toUpperCase() }));
  expect(variables.unitKeys[0]).toBe(UNIT_KEY);
  expect(variables.unitAts[0]).toBe(UNIT_AT);
  expect(variables.kinds[0]).toBe('core');
  expect(variables.doctorId).toBe(DOCTOR_UUID);
  expect(variables.requestId).toBe(REQUEST_UUID);
  expect(variables.now).toBe(NOW.toISOString());
  expect(variables.appointmentId).toBe(APPOINTMENT_UUID);
  expect(variables.holdHash).toBeNull();
  expect(variables.expiresAt).toBeNull();
  expect(variables.operation).toMatch(/^scheduler_claim:[a-f0-9]{64}$/);
  // Same input replays to the same receipt id; different units must not.
  expect(claimVariables(coreClaim()).operation).toBe(variables.operation);
  expect(claimVariables(coreClaim({ units: [{ unitKey: `${UNIT_KEY}_b`, unitAt: UNIT_AT, kind: 'buffer' }] })).operation).not.toBe(variables.operation);
});

test('accepts the full 96-unit range without padding and still refuses 97', () => {
  const units = Array.from({ length: 96 }, (_, index) => ({ unitKey: `${UNIT_KEY}_${index}`, unitAt: UNIT_AT, kind: index === 95 ? 'buffer' : 'core' }));
  const variables = claimVariables(coreClaim({ units }));
  expect(variables.unitKeys[95]).toBe(`${UNIT_KEY}_95`);
  expect(variables.kinds[95]).toBe('buffer');
  expect(variables.unitKeys.some((key) => key.startsWith('__scheduler_unused_'))).toBe(false);
  expect(Object.keys(variables).filter((key) => /^slot\d+$/.test(key) && variables[key] === true)).toHaveLength(96);
  expect(() => claimVariables(coreClaim({ units: [...units, { unitKey: `${UNIT_KEY}_96`, unitAt: UNIT_AT, kind: 'core' }] }))).toThrow(expect.objectContaining({ code: 'invalid-argument' }));
});

test('hashes hold ids instead of ever returning them', () => {
  const hashed = holdHash(HOLD_ID);
  expect(hashed).toMatch(/^[a-f0-9]{64}$/);
  expect(hashed).toBe(holdHashOf(HOLD_ID));
  expect(hashed).not.toContain(HOLD_ID);
  const held = claimVariables(holdClaim());
  expect(held.holdHash).toBe(hashed);
  expect(held.expiresAt).toBe('2026-10-26T02:10:00.000Z');
  expect(JSON.stringify(held)).not.toContain(HOLD_ID);
  // A renewal may only claim its own live hold.
  expect(claimVariables(holdClaim({ ownHoldHash: hashed })).ownHoldHash).toBe(hashed);
});

test('rejects malformed claims before the store is touched', () => {
  const cases = {
    'no units': { units: [] },
    'neither hold nor appointment': holdOverride({ holdHash: null, expiresAt: null }),
    'over the unit limit': { units: Array.from({ length: 97 }, (_, index) => ({ unitKey: `${UNIT_KEY}_${index}`, unitAt: UNIT_AT, kind: 'core' })) },
    'duplicate unit keys': { units: [{ unitKey: UNIT_KEY, unitAt: UNIT_AT, kind: 'core' }, { unitKey: UNIT_KEY, unitAt: UNIT_AT, kind: 'buffer' }] },
    'unknown unit kind': { units: [{ unitKey: UNIT_KEY, unitAt: UNIT_AT, kind: 'tentative' }] },
    'oversized unit key': { units: [{ unitKey: 'x'.repeat(221), unitAt: UNIT_AT, kind: 'core' }] },
    'malformed unit timestamp': { units: [{ unitKey: UNIT_KEY, unitAt: 'not-a-time', kind: 'core' }] },
    'missing actor': { actorUid: '' },
    'control characters in the audit action': { auditAction: 'appointment\nbooked' },
    'missing legacy doctor': { doctorLegacyId: '' },
    'bad doctor uuid': { doctorId: 'not-a-uuid' },
    'bad request uuid': { requestId: 'not-a-uuid' },
    'bad appointment uuid': { appointmentId: 'not-a-uuid' },
    'malformed own hold hash': { ownHoldHash: 'not-a-hash' },
    'malformed target hold hash': holdOverride({ holdHash: holdHashOf(HOLD_ID).toUpperCase(), expiresAt: '2026-10-26T02:10:00.000Z' }),
    'hold expiring exactly at the claim time': holdOverride({ holdHash: holdHashOf(HOLD_ID), expiresAt: NOW.toISOString() }),
    'hold already expired': holdOverride({ holdHash: holdHashOf(HOLD_ID), expiresAt: '2026-10-26T01:59:59.000Z' }),
    'hold without an expiry': holdOverride({ holdHash: holdHashOf(HOLD_ID) }),
    'renewing somebody else’s hold': holdOverride({ holdHash: holdHashOf(HOLD_ID), expiresAt: '2026-10-26T02:10:00.000Z', ownHoldHash: holdHashOf('another-hold-id-123') }),
    'appointment with an expiry': { expiresAt: '2026-10-26T02:10:00.000Z' },
    'appointment and hold together': { holdHash: holdHashOf(HOLD_ID), expiresAt: '2026-10-26T02:10:00.000Z' },
    'appointment claim of a hold unit': { units: [{ unitKey: UNIT_KEY, unitAt: UNIT_AT, kind: 'hold' }] },
    'hold claim of an appointment unit': holdOverride({ holdHash: holdHashOf(HOLD_ID), expiresAt: '2026-10-26T02:10:00.000Z', units: [{ unitKey: UNIT_KEY, unitAt: UNIT_AT, kind: 'core' }] }),
  };
  for (const [name, overrides] of Object.entries(cases)) expect(() => claimVariables(coreClaim(overrides)), name).toThrow(expect.objectContaining({ code: 'invalid-argument' }));
  expect(() => claimVariables(coreClaim())).not.toThrow();
  expect(() => claimVariables(holdClaim())).not.toThrow();
  for (const bad of ['short', 'has spaces in it 12', 'x'.repeat(65)]) expect(() => holdHash(bad)).toThrow(expect.objectContaining({ code: 'invalid-argument' }));
});

test('requires a complete store and passes the padded payload through', async () => {
  expect(() => createSqlSchedulerClaims({})).toThrow('A complete scheduler SQL claim store is required.');
  const store = { claim: vi.fn(async () => ({ ok: true })), releaseHold: vi.fn(async () => ({ ok: true })), releaseAppointment: vi.fn(async () => ({ ok: true })) };
  const claims = createSqlSchedulerClaims({ store });
  expect(await claims.claim(coreClaim())).toEqual({ ok: true });
  const payload = store.claim.mock.calls[0][0];
  expect(payload.unitKeys).toHaveLength(96);
  expect(payload.slot0).toBe(true);
  expect(payload.actorUid).toBe('uid-guest-1');
});

test('releases are scoped to the doctor, hold or appointment and hash the hold id', async () => {
  const store = { claim: vi.fn(), releaseHold: vi.fn(async () => true), releaseAppointment: vi.fn(async () => true) };
  const claims = createSqlSchedulerClaims({ store });
  const scope = { actorUid: 'uid-guest-1', actorRole: 'patient', doctorId: DOCTOR_UUID, doctorLegacyId: 'brig-ak-sood', holdId: HOLD_ID, requestId: REQUEST_UUID };
  await claims.releaseHold(scope);
  const released = store.releaseHold.mock.calls[0][0];
  expect(released).not.toHaveProperty('holdId');
  expect(released.holdHash).toBe(holdHashOf(HOLD_ID));
  expect(released).toMatchObject({ actorUid: 'uid-guest-1', actorRole: 'patient', doctorId: DOCTOR_UUID, doctorLegacyId: 'brig-ak-sood', requestId: REQUEST_UUID });
  expect(released.operation).toMatch(/^scheduler_release_hold:[a-f0-9]{64}$/);

  await claims.releaseAppointment({ actorUid: 'uid-staff', actorRole: 'manager', doctorLegacyId: 'brig-ak-sood', appointmentId: APPOINTMENT_UUID, requestId: REQUEST_UUID, auditAction: 'appointment_cancelled' });
  const scoped = store.releaseAppointment.mock.calls[0][0];
  expect(scoped).toMatchObject({ doctorLegacyId: 'brig-ak-sood', appointmentId: APPOINTMENT_UUID, actorRole: 'manager', auditAction: 'appointment_cancelled' });
  expect(scoped.operation).toMatch(/^scheduler_release_appointment:[a-f0-9]{64}$/);

  await expect(claims.releaseHold({ ...scope, holdId: 'short' })).rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(claims.releaseHold({ ...scope, doctorId: 'not-a-uuid' })).rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(claims.releaseAppointment({ actorUid: 'uid-staff', actorRole: 'manager', doctorLegacyId: 'brig-ak-sood', appointmentId: 'not-a-uuid', requestId: REQUEST_UUID, auditAction: 'appointment_cancelled' })).rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(claims.releaseAppointment({ actorUid: 'uid-staff', actorRole: 'manager', doctorLegacyId: '', appointmentId: APPOINTMENT_UUID, requestId: REQUEST_UUID, auditAction: 'appointment_cancelled' })).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(store.releaseHold).toHaveBeenCalledTimes(1);
  expect(store.releaseAppointment).toHaveBeenCalledTimes(1);
});

test('the generated-store adapter calls only the three claim operations', async () => {
  const generatedPath = require.resolve('../generated/sql');
  const previous = require.cache[generatedPath];
  const calls = [];
  const record = (name) => async (dc, data) => { calls.push({ name, dc, data }); return { name }; };
  require.cache[generatedPath] = {
    id: generatedPath,
    filename: generatedPath,
    loaded: true,
    exports: {
      claimAppointmentUnits: record('claimAppointmentUnits'),
      releaseHoldUnits: record('releaseHoldUnits'),
      releaseAppointmentUnits: record('releaseAppointmentUnits'),
    },
  };
  try {
    const dc = { marker: 'dc' };
    const store = sqlSchedulerClaimStore(dc);
    expect(await store.claim({ a: 1 })).toEqual({ name: 'claimAppointmentUnits' });
    expect(await store.releaseHold({ b: 2 })).toEqual({ name: 'releaseHoldUnits' });
    expect(await store.releaseAppointment({ c: 3 })).toEqual({ name: 'releaseAppointmentUnits' });
    expect(calls).toEqual([
      { name: 'claimAppointmentUnits', dc, data: { a: 1 } },
      { name: 'releaseHoldUnits', dc, data: { b: 2 } },
      { name: 'releaseAppointmentUnits', dc, data: { c: 3 } },
    ]);
  } finally {
    if (previous) require.cache[generatedPath] = previous;
    else delete require.cache[generatedPath];
  }
});
