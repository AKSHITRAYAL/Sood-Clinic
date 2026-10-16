import { describe, expect, it } from 'vitest';
import { istInstant } from '../../lib/ist.js';
import { placeAppointmentInTransaction, releaseUnitsInTransaction } from '../../src/scheduler/placement.js';

/** A stand-in Firestore transaction that records every write. */
const harness = (existingUnits = {}) => {
  const writes = [];
  const deletes = [];
  const transaction = {
    getAll: async (...refs) => refs.map((ref) => ({
      exists: Boolean(existingUnits[ref.id]),
      id: ref.id,
      data: () => existingUnits[ref.id],
    })),
    set: (ref, data) => writes.push({ id: ref.id, data }),
    delete: (ref) => deletes.push(ref.id),
  };
  const db = { collection: (name) => ({ doc: (id) => ({ id, path: `${name}/${id}` }) }) };
  return { db, transaction, writes, deletes };
};

const booking = ({ existingUnits, startsAt, endsAt, bufferBefore, bufferAfter, kindForCore, kindForBuffer, holdId, claimHoldId, claimAppointmentId, now }) => {
  const test = harness(existingUnits);
  return placeAppointmentInTransaction({
    db: test.db,
    transaction: test.transaction,
    doctorId: 'doc',
    startsAt,
    endsAt,
    ...(bufferBefore === undefined ? {} : { bufferBefore }),
    ...(bufferAfter === undefined ? {} : { bufferAfter }),
    ...(kindForCore === undefined ? {} : { kindForCore }),
    ...(kindForBuffer === undefined ? {} : { kindForBuffer }),
    ...(holdId === undefined ? {} : { holdId }),
    ...(holdId === undefined ? {} : { expiresAt: new Date('2026-10-12T00:05:00.000Z') }),
    ...(claimHoldId === undefined ? {} : { claimHoldId }),
    ...(claimAppointmentId === undefined ? {} : { claimAppointmentId }),
    appointmentRef: { id: 'appointment-one' },
    visitTypeId: 'consultation',
    now: now || new Date('2026-10-12T00:00:00.000Z'),
  }).then((unitIds) => ({ ...test, unitIds }));
};

const startsAt = istInstant('2026-10-12', '08:00');

describe('unit lock placement', () => {
  it('writes one core unit per five minutes of a forty-minute booking', async () => {
    const endsAt = new Date(startsAt.getTime() + 40 * 60 * 1000);
    const { writes, unitIds } = await booking({ startsAt, endsAt });
    expect(unitIds).toEqual([
      'doc_202610120800', 'doc_202610120805', 'doc_202610120810', 'doc_202610120815',
      'doc_202610120820', 'doc_202610120825', 'doc_202610120830', 'doc_202610120835',
    ]);
    expect(writes).toHaveLength(8);
    expect(writes.every((write) => write.data.kind === 'core')).toBe(true);
    expect(writes[0].data).toMatchObject({
      doctorId: 'doc',
      dateKey: '2026-10-12',
      appointmentId: 'appointment-one',
      visitTypeId: 'consultation',
      blockId: null,
    });
    expect(writes.at(-1).data.endsAt.toDate().toISOString()).toBe(endsAt.toISOString());
  });

  it('tags the units covered by both buffers', async () => {
    const endsAt = new Date(startsAt.getTime() + 40 * 60 * 1000);
    const { writes } = await booking({ startsAt, endsAt, bufferBefore: 5, bufferAfter: 10 });
    const tagged = Object.fromEntries(writes.map((write) => [write.id, write.data.kind]));
    expect(tagged).toEqual({
      // Core units are written first so a unit shared with a buffer keeps `core`.
      doc_202610120800: 'core',
      doc_202610120805: 'core',
      doc_202610120810: 'core',
      doc_202610120815: 'core',
      doc_202610120820: 'core',
      doc_202610120825: 'core',
      doc_202610120830: 'core',
      doc_202610120835: 'core',
      doc_202610120755: 'buffer',
      doc_202610120840: 'buffer',
      doc_202610120845: 'buffer',
    });
    expect(writes).toHaveLength(11);
  });

  it('tags every unit of a hold as a hold, buffers included', async () => {
    const endsAt = new Date(startsAt.getTime() + 20 * 60 * 1000);
    const { writes, unitIds } = await booking({
      startsAt,
      endsAt,
      bufferBefore: 5,
      bufferAfter: 10,
      kindForCore: 'hold',
      kindForBuffer: 'hold',
      holdId: 'hold-hash',
    });
    // A hold must own the units in its buffers too: otherwise releasing or expiring the
    // hold leaves buffer units behind that still block the next booking of that time.
    expect(unitIds).toHaveLength(7);
    expect(writes).toHaveLength(7);
    expect(writes.every((write) => write.data.kind === 'hold')).toBe(true);
    expect(writes.every((write) => write.data.holdId === 'hold-hash')).toBe(true);
    expect(writes.every((write) => write.data.expiresAt.toDate().toISOString() === '2026-10-12T00:05:00.000Z')).toBe(true);
  });

  it('refuses a range with a conflicting unit and writes nothing', async () => {
    const endsAt = new Date(startsAt.getTime() + 20 * 60 * 1000);
    const test = harness({ doc_202610120810: { kind: 'core', appointmentId: 'other' } });
    await expect(placeAppointmentInTransaction({
      db: test.db,
      transaction: test.transaction,
      doctorId: 'doc',
      startsAt,
      endsAt,
      appointmentRef: { id: 'appointment-one' },
      now: new Date('2026-10-12T00:00:00.000Z'),
    })).rejects.toMatchObject({ code: 'aborted', details: { reason: 'SLOT_TAKEN' } });
    expect(test.writes).toHaveLength(0);
  });

  it('lets a booking claim the hold it created and ignores an expired hold', async () => {
    const endsAt = new Date(startsAt.getTime() + 20 * 60 * 1000);
    const hold = { kind: 'hold', holdId: 'hold-hash', expiresAt: new Date('2026-10-12T00:10:00.000Z') };
    const held = await booking({
      existingUnits: { doc_202610120800: hold, doc_202610120805: hold, doc_202610120810: hold, doc_202610120815: hold },
      startsAt,
      endsAt,
      claimHoldId: 'hold-hash',
    });
    expect(held.unitIds).toHaveLength(4);
    expect(held.writes.every((write) => write.data.kind === 'core')).toBe(true);

    const expired = { kind: 'hold', holdId: 'stale', expiresAt: new Date('2026-10-11T23:59:00.000Z') };
    const reclaimed = await booking({
      existingUnits: { doc_202610120800: expired, doc_202610120805: expired, doc_202610120810: expired, doc_202610120815: expired },
      startsAt,
      endsAt,
    });
    expect(reclaimed.unitIds).toHaveLength(4);
  });

  it('keeps an appointment own units when it is moved', async () => {
    const endsAt = new Date(startsAt.getTime() + 20 * 60 * 1000);
    const own = { kind: 'core', appointmentId: 'appointment-one' };
    const moved = await booking({
      existingUnits: { doc_202610120800: own, doc_202610120805: own, doc_202610120810: own, doc_202610120815: own },
      startsAt,
      endsAt,
      claimAppointmentId: 'appointment-one',
    });
    expect(moved.unitIds).toHaveLength(4);

    const other = harness({ doc_202610120800: { kind: 'core', appointmentId: 'appointment-two' } });
    await expect(placeAppointmentInTransaction({
      db: other.db,
      transaction: other.transaction,
      doctorId: 'doc',
      startsAt,
      endsAt,
      appointmentRef: { id: 'appointment-one' },
      now: new Date('2026-10-12T00:00:00.000Z'),
    })).rejects.toMatchObject({ details: { reason: 'SLOT_TAKEN' } });
  });

  it('releases only the units it is given', () => {
    const test = harness();
    releaseUnitsInTransaction({ db: test.db, transaction: test.transaction, slotIds: ['a', 'b'] });
    expect(test.deletes).toEqual(['a', 'b']);
  });
});
