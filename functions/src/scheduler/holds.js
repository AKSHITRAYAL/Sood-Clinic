const { istDateKey, toIstParts } = require('../../lib/ist');
const { placeAppointmentInTransaction, unitsHeldBy } = require('./placement');
const { schedulerError } = require('./errors');

// Spec 6.4: a hold lives for five minutes and is named by a client-generated random
// string, so the guest who created it can release it or convert it into a booking.
const HOLD_MINUTES = 5;
const HOLD_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const MINUTE_MS = 60 * 1000;

const isHoldId = (value) => typeof value === 'string' && HOLD_ID_PATTERN.test(value.trim());

const asDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const istTimeOf = (value) => {
  const { hour, minute } = toIstParts(value);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

/**
 * The two public hold callables (spec 6.4-6.5).
 *
 * `holdSlot` locks the five-minute units of an offered time as `kind:'hold'` with an
 * expiry, so the guest can review their details without racing another booking.
 * `releaseHold` gives those units back immediately.
 *
 * Both are handed the clinic's day-context loader and the pure engine in the same way
 * the availability callables are (see `availabilityCallables.js`), which keeps this
 * module free of Firebase Functions imports and unit-testable with fakes.
 */
const createHoldHandlers = ({
  db,
  loadDayContext,
  slotsForDay,
  rateLimit,
  hashToken,
  now = () => new Date(),
}) => {
  // Units are a server-only collection, and the hold id is the only thing that may claim
  // them. Storing the hash means the stored value is useless to anyone who reads it.
  const unitsForHoldId = async (holdIdHash) => db.collection('appointmentSlots')
    .where('holdId', '==', holdIdHash)
    .get();

  const deleteRefs = async (refs) => {
    if (!refs.length) return;
    const batch = db.batch();
    refs.forEach((ref) => batch.delete(ref));
    await batch.commit();
  };

  const holdSlot = async (request) => {
    const data = request?.data || {};
    const doctorId = String(data.doctorId || '').trim().slice(0, 120);
    const visitTypeId = String(data.visitTypeId || '').trim().slice(0, 120);
    const startsAt = asDate(data.startsAt);
    const holdId = typeof data.holdId === 'string' ? data.holdId.trim() : '';
    if (!doctorId || !visitTypeId || !startsAt) throw schedulerError('invalid-argument', 'VALIDATION', 'Choose an available appointment time.');
    if (!isHoldId(holdId)) throw schedulerError('invalid-argument', 'VALIDATION', 'Refresh the page and choose a time again.');
    await rateLimit(request);

    const at = now();
    const dateKey = istDateKey(startsAt);
    const context = await loadDayContext({ doctorId, dateKey, visitTypeId, now: at });
    const time = istTimeOf(startsAt);
    const holdIdHash = hashToken(holdId);
    const endsAt = new Date(startsAt.getTime() + context.visitType.minutes * MINUTE_MS);

    // The time must be offered by the engine right now, unless the units are already
    // this hold's own (a retry of a hold the guest still owns).
    let target = slotsForDay({ doctorId, context, dateKey, now: at }).find((slot) => slot.time === time) || null;
    if (!target && await unitsHeldBy({
      db,
      doctorId,
      startsAt,
      endsAt,
      bufferBefore: context.visitType.bufferBeforeMinutes,
      bufferAfter: context.visitType.bufferAfterMinutes,
      claimHoldId: holdIdHash,
      now: at,
    })) {
      target = { startsAt, endsAt, time };
    }
    if (!target) throw schedulerError('failed-precondition', 'SLOT_UNAVAILABLE', 'That time is no longer available.');

    const expiresAt = new Date(at.getTime() + HOLD_MINUTES * MINUTE_MS);
    let unitIds = [];
    await db.runTransaction(async (transaction) => {
      unitIds = await placeAppointmentInTransaction({
        db,
        transaction,
        doctorId,
        startsAt: target.startsAt,
        endsAt: target.endsAt,
        bufferBefore: context.visitType.bufferBeforeMinutes,
        bufferAfter: context.visitType.bufferAfterMinutes,
        kindForCore: 'hold',
        kindForBuffer: 'hold',
        holdId: holdIdHash,
        visitTypeId: context.visitType.id,
        expiresAt,
        claimHoldId: holdIdHash,
        now: at,
      });
    });

    // Spec 6.4: at most one active hold per holdId. Re-holding a different time releases
    // what this hold no longer covers, after the new units are safely written.
    const snapshot = await unitsForHoldId(holdIdHash);
    await deleteRefs(snapshot.docs
      .filter((document) => document.get('kind') === 'hold'
        && document.get('doctorId') === doctorId
        && !unitIds.includes(document.id))
      .map((document) => document.ref));

    return { holdId, expiresAt: expiresAt.toISOString() };
  };

  const releaseHold = async (request) => {
    const data = request?.data || {};
    const doctorId = String(data.doctorId || '').trim().slice(0, 120);
    const holdId = typeof data.holdId === 'string' ? data.holdId.trim() : '';
    if (!doctorId) throw schedulerError('invalid-argument', 'VALIDATION', 'Choose a valid held appointment time.');
    if (!isHoldId(holdId)) throw schedulerError('invalid-argument', 'VALIDATION', 'Choose a valid held appointment time.');
    await rateLimit(request);

    const snapshot = await unitsForHoldId(hashToken(holdId));
    // A hold id alone is not enough: the release is scoped to the doctor it was held for,
    // and only hold units are ever deleted.
    await deleteRefs(snapshot.docs
      .filter((document) => document.get('kind') === 'hold' && document.get('doctorId') === doctorId)
      .map((document) => document.ref));
    return { ok: true };
  };

  return { holdSlot, releaseHold };
};

module.exports = { HOLD_MINUTES, createHoldHandlers, isHoldId };
