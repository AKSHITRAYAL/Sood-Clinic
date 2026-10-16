import { describe, expect, it } from 'vitest';
import { istInstant, istDateKey, weekdayIst } from '../../lib/ist.js';
import { computeDaySlots, groupUnitsByDate } from '../../lib/engine/availability.js';
import { createHoldHandlers, HOLD_MINUTES, isHoldId } from '../../src/scheduler/holds.js';

// A fake Firestore holding only `appointmentSlots`, with the three shapes the module uses:
// `where('holdId','==',…).get()`, `doc(id)` lookups for `getAll`, a batch and a transaction.
const store = (units = {}) => {
  const docs = () => Object.entries(units).map(([id, data]) => ({
    id,
    ref: { id, path: `appointmentSlots/${id}` },
    get: (field) => data[field],
    data: () => data,
  }));
  const deleted = [];
  const writes = [];
  const refFor = (id) => ({ id, path: `appointmentSlots/${id}` });
  const db = {
    collection: (name) => ({
      doc: (id) => refFor(id),
      where: (field, _op, value) => ({
        get: async () => ({ docs: docs().filter((document) => document.get(field) === value) }),
      }),
    }),
    getAll: async (...refs) => refs.map((ref) => ({
      exists: Object.prototype.hasOwnProperty.call(units, ref.id),
      id: ref.id,
      get: (field) => units[ref.id]?.[field],
      data: () => units[ref.id],
    })),
    batch: () => ({
      delete: (ref) => { deleted.push(ref.id); },
      commit: async () => {
        deleted.forEach((id) => { delete units[id]; });
      },
    }),
    runTransaction: async (handler) => handler({
      getAll: async (...refs) => refs.map((ref) => ({
        exists: Object.prototype.hasOwnProperty.call(units, ref.id),
        id: ref.id,
        get: (field) => units[ref.id]?.[field],
        data: () => units[ref.id],
      })),
      set: (ref, data) => { writes.push({ id: ref.id, data }); units[ref.id] = data; },
      delete: (ref) => { deleted.push(ref.id); delete units[ref.id]; },
    }),
  };
  return { db, units, deleted, writes };
};

const AT = new Date('2026-10-12T03:30:00.000Z'); // 09:00 IST on a Monday
const DATE_KEY = istDateKey(AT);
const VISIT_TYPE = {
  id: 'consultation', minutes: 20, bufferBeforeMinutes: 0, bufferAfterMinutes: 0,
  minNoticeMinutes: 0, maxAdvanceDays: 30, intervalMinutes: 20, dailyLimit: null,
};

// The real engine is used for the slot list, so "offered by computeDaySlots" means the same
// thing here as it does in production; only Firestore and the clock are faked.
const handlersFor = (reference) => {
  const occupiedUnitIds = () => groupUnitsByDate(Object.entries(reference.units).map(([id, unit]) => ({
    id,
    dateKey: unit.dateKey,
    kind: unit.kind,
    expiresAt: unit.expiresAt,
    startsAt: unit.startsAt,
    endsAt: unit.endsAt,
  })), { now: AT, doctorId: 'doc' }).get(DATE_KEY) || new Set();
  const loadDayContext = async () => ({
    visitType: VISIT_TYPE,
    weeklySessions: [{ weekday: weekdayIst(DATE_KEY), start: '09:00', end: '12:00' }],
    exception: null,
    blocks: [],
    occupiedUnitIds: occupiedUnitIds(),
    activeCountForType: 0,
  });
  const slotsForDay = ({ context, dateKey }) => computeDaySlots({
    dateKey,
    now: AT,
    doctorId: 'doc',
    visitType: context.visitType,
    weeklySessions: context.weeklySessions,
    exception: context.exception,
    blocks: context.blocks,
    occupiedUnitIds: context.occupiedUnitIds,
    activeCountForType: context.activeCountForType,
  });
  let rateLimited = 0;
  const handlers = createHoldHandlers({
    db: reference.db,
    loadDayContext,
    slotsForDay,
    rateLimit: async () => { rateLimited += 1; },
    hashToken: (value) => `hash:${value}`,
    now: () => AT,
  });
  return {
    ...handlers,
    rateLimitedCount: () => rateLimited,
    // What the engine currently offers for the seeded day, so a test can prove whether a
    // hold really hides a time (rather than the slot happening to be free).
    offeredTimes: async () => slotsForDay({ context: await loadDayContext(), dateKey: DATE_KEY }).map((slot) => slot.time),
  };
};

const HOLD_ID = 'a'.repeat(32);
const request = (data) => ({ data });

describe('holdSlot (spec 6.4)', () => {
  it('locks every unit of an offered time as a five-minute hold', async () => {
    const reference = store();
    const handlers = handlersFor(reference);
    expect(await handlers.offeredTimes()).toContain('09:00');
    const result = await handlers.holdSlot(request({
      doctorId: 'doc', visitTypeId: 'consultation', startsAt: istInstant(DATE_KEY, '09:00').toISOString(), holdId: HOLD_ID,
    }));

    expect(result).toEqual({ holdId: HOLD_ID, expiresAt: new Date(AT.getTime() + HOLD_MINUTES * 60 * 1000).toISOString() });
    expect(Object.keys(reference.units)).toEqual([
      'doc_202610120900', 'doc_202610120905', 'doc_202610120910', 'doc_202610120915',
    ]);
    expect(Object.values(reference.units).every((unit) => unit.kind === 'hold')).toBe(true);
    expect(Object.values(reference.units).every((unit) => unit.holdId === `hash:${HOLD_ID}`)).toBe(true);
    expect(handlers.rateLimitedCount()).toBe(1);
  });

  it('refuses a time the engine does not offer, with SLOT_UNAVAILABLE', async () => {
    const reference = store();
    const handlers = handlersFor(reference);
    await expect(handlers.holdSlot(request({
      doctorId: 'doc', visitTypeId: 'consultation', startsAt: istInstant(DATE_KEY, '09:10').toISOString(), holdId: HOLD_ID,
    }))).rejects.toMatchObject({ code: 'failed-precondition', details: { reason: 'SLOT_UNAVAILABLE' } });
    expect(Object.keys(reference.units)).toEqual([]);
    // The throttle runs before the engine, so a refused attempt still counts against the
    // caller's hourly allowance (spec 6: holdSlot 20/hour).
    expect(handlers.rateLimitedCount()).toBe(1);
  });

  it('refuses a hold id outside the 16-64 character contract', async () => {
    const handlers = handlersFor(store());
    for (const holdId of ['short', 'x'.repeat(15), 'y'.repeat(65), 'has spaces here 1234']) {
      await expect(handlers.holdSlot(request({
        doctorId: 'doc', visitTypeId: 'consultation', startsAt: istInstant(DATE_KEY, '09:00').toISOString(), holdId,
      }))).rejects.toMatchObject({ code: 'invalid-argument', details: { reason: 'VALIDATION' } });
    }
  });

  it('re-holds its own time and refuses another hold id on the same units', async () => {
    // A live hold hides the time from the engine, so the own-hold recovery is the only
    // reason the guest can re-hold the same slot.
    const live = new Date(AT.getTime() + 4 * 60 * 1000);
    const held = {
      doc_202610120900: { kind: 'hold', holdId: `hash:${HOLD_ID}`, doctorId: 'doc', dateKey: DATE_KEY, expiresAt: live, startsAt: AT, endsAt: AT },
      doc_202610120905: { kind: 'hold', holdId: `hash:${HOLD_ID}`, doctorId: 'doc', dateKey: DATE_KEY, expiresAt: live, startsAt: AT, endsAt: AT },
      doc_202610120910: { kind: 'hold', holdId: `hash:${HOLD_ID}`, doctorId: 'doc', dateKey: DATE_KEY, expiresAt: live, startsAt: AT, endsAt: AT },
      doc_202610120915: { kind: 'hold', holdId: `hash:${HOLD_ID}`, doctorId: 'doc', dateKey: DATE_KEY, expiresAt: live, startsAt: AT, endsAt: AT },
    };
    const own = handlersFor(store({ ...held }));
    expect(await own.offeredTimes()).not.toContain('09:00');
    await expect(own.holdSlot(request({
      doctorId: 'doc', visitTypeId: 'consultation', startsAt: istInstant(DATE_KEY, '09:00').toISOString(), holdId: HOLD_ID,
    }))).resolves.toMatchObject({ holdId: HOLD_ID });

    // Another guest's hold hides the time and cannot be claimed (spec 6.4-6.5).
    const mine = new Date(AT.getTime() + 60 * 60 * 1000);
    const other = handlersFor(store({
      doc_202610120900: { ...held.doc_202610120900, expiresAt: mine },
      doc_202610120905: { ...held.doc_202610120905, expiresAt: mine },
      doc_202610120910: { ...held.doc_202610120910, expiresAt: mine },
      doc_202610120915: { ...held.doc_202610120915, expiresAt: mine },
    }));
    expect(await other.offeredTimes()).not.toContain('09:00');
    await expect(other.holdSlot(request({
      doctorId: 'doc', visitTypeId: 'consultation', startsAt: istInstant(DATE_KEY, '09:00').toISOString(), holdId: 'b'.repeat(32),
    }))).rejects.toMatchObject({ code: 'failed-precondition', details: { reason: 'SLOT_UNAVAILABLE' } });
  });

  it('keeps at most one active hold per hold id', async () => {
    const stale = {
      doc_202610121000: { kind: 'hold', holdId: `hash:${HOLD_ID}`, doctorId: 'doc', dateKey: DATE_KEY, expiresAt: new Date(AT.getTime() + 60 * 1000), startsAt: AT, endsAt: AT },
      doc_202610121005: { kind: 'hold', holdId: `hash:${HOLD_ID}`, doctorId: 'doc', dateKey: DATE_KEY, expiresAt: new Date(AT.getTime() + 60 * 1000), startsAt: AT, endsAt: AT },
      // Another doctor's hold id must not be touched, even though the hash collides in this fake.
      other_202610121000: { kind: 'hold', holdId: `hash:${HOLD_ID}`, doctorId: 'other', dateKey: DATE_KEY, expiresAt: new Date(AT.getTime() + 60 * 1000), startsAt: AT, endsAt: AT },
    };
    const reference = store({ ...stale });
    const handlers = handlersFor(reference);
    await handlers.holdSlot(request({
      doctorId: 'doc', visitTypeId: 'consultation', startsAt: istInstant(DATE_KEY, '09:00').toISOString(), holdId: HOLD_ID,
    }));
    expect(Object.keys(reference.units).sort()).toEqual([
      'doc_202610120900', 'doc_202610120905', 'doc_202610120910', 'doc_202610120915', 'other_202610121000',
    ]);
  });
});

describe('releaseHold (spec 6.5)', () => {
  const heldUnits = () => ({
    doc_202610120900: { kind: 'hold', holdId: `hash:${HOLD_ID}`, doctorId: 'doc' },
    doc_202610120905: { kind: 'hold', holdId: `hash:${HOLD_ID}`, doctorId: 'doc' },
    doc_202610120900_other: { kind: 'hold', holdId: `hash:${HOLD_ID}`, doctorId: 'other' },
    doc_202610121000: { kind: 'hold', holdId: 'hash:somebody-else', doctorId: 'doc' },
    doc_202610121100: { kind: 'core', holdId: null, doctorId: 'doc' },
  });

  it('deletes only that doctor\'s hold units and reports ok', async () => {
    const reference = store(heldUnits());
    const handlers = handlersFor(reference);
    await expect(handlers.releaseHold(request({ doctorId: 'doc', holdId: HOLD_ID }))).resolves.toEqual({ ok: true });
    expect(Object.keys(reference.units).sort()).toEqual([
      'doc_202610120900_other', 'doc_202610121000', 'doc_202610121100',
    ]);
  });

  it('refuses a missing doctor or a malformed hold id', async () => {
    const handlers = handlersFor(store(heldUnits()));
    await expect(handlers.releaseHold(request({ doctorId: '', holdId: HOLD_ID }))).rejects.toMatchObject({ details: { reason: 'VALIDATION' } });
    await expect(handlers.releaseHold(request({ doctorId: 'doc', holdId: 'nope' }))).rejects.toMatchObject({ details: { reason: 'VALIDATION' } });
  });
});

describe('isHoldId', () => {
  it('accepts the contract range and rejects anything else', () => {
    expect(isHoldId('a'.repeat(16))).toBe(true);
    expect(isHoldId('a'.repeat(64))).toBe(true);
    expect(isHoldId('a'.repeat(15))).toBe(false);
    expect(isHoldId('a'.repeat(65))).toBe(false);
    expect(isHoldId('')).toBe(false);
    expect(isHoldId('short-but-padded-to-16')).toBe(true);
    expect(isHoldId('has spaces in it 1234')).toBe(false);
    expect(isHoldId(1234567890123456)).toBe(false);
    expect(isHoldId(undefined)).toBe(false);
  });
});
