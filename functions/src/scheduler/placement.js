const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { istDateKey } = require('../../lib/ist');
const { unitSlotsForRange } = require('../../lib/engine/units');
const { asMillis, planPlacement } = require('../../lib/engine/placement');
const { schedulerError } = require('./errors');

const MINUTE_MS = 60 * 1000;

const asDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw schedulerError('invalid-argument', 'VALIDATION', 'A valid time is required.');
  return date;
};

/** One document per five-minute unit covering [start, end), tagged with its role. */
const unitDocsForRange = (doctorId, start, end, kind) => unitSlotsForRange(doctorId, start, end)
  .map((unit) => ({ ...unit, kind }));

/**
 * Locks every five-minute unit the appointment occupies (core time plus both buffers) in ONE
 * transaction, so overlapping bookings of different lengths cannot both succeed.
 * A booking tags its units `core` and `buffer`; a hold passes `hold` for both, because every
 * unit a hold owns must expire with it and be released together.
 */
const placeAppointmentInTransaction = async ({
  db,
  transaction,
  doctorId,
  startsAt,
  endsAt,
  bufferBefore = 0,
  bufferAfter = 0,
  appointmentRef = null,
  kindForCore = 'core',
  kindForBuffer = 'buffer',
  holdId = null,
  visitTypeId = null,
  expiresAt = null,
  claimHoldId = null,
  claimAppointmentId = null,
  now = new Date(),
}) => {
  if (!doctorId) throw schedulerError('invalid-argument', 'VALIDATION', 'A doctor is required.');
  const start = asDate(startsAt);
  const end = asDate(endsAt);
  if (end <= start) throw schedulerError('invalid-argument', 'VALIDATION', 'The appointment must end after it starts.');
  const occupiedStart = new Date(start.getTime() - bufferBefore * MINUTE_MS);
  const occupiedEnd = new Date(end.getTime() + bufferAfter * MINUTE_MS);

  // Core wins when a buffer range shares a partly-aligned unit with it.
  const units = new Map(unitDocsForRange(doctorId, start, end, kindForCore).map((unit) => [unit.id, unit]));
  for (const unit of [
    ...unitDocsForRange(doctorId, occupiedStart, start, kindForBuffer),
    ...unitDocsForRange(doctorId, end, occupiedEnd, kindForBuffer),
  ]) if (!units.has(unit.id)) units.set(unit.id, unit);

  const unitIds = [...units.keys()];
  if (!unitIds.length) return [];
  const refs = unitIds.map((unitId) => db.collection('appointmentSlots').doc(unitId));
  const snapshots = await transaction.getAll(...refs);
  const existingUnits = new Map();
  snapshots.forEach((snapshot, index) => {
    if (snapshot.exists) existingUnits.set(unitIds[index], snapshot.data());
  });

  const plan = planPlacement({
    candidateUnitIds: unitIds,
    existingUnits,
    now: asDate(now),
    claimHoldId,
    claimAppointmentId,
  });
  if (!plan.ok) throw schedulerError('aborted', 'SLOT_TAKEN', 'That time was just booked. Please choose another time.');

  for (const unit of units.values()) {
    transaction.set(db.collection('appointmentSlots').doc(unit.id), {
      doctorId,
      dateKey: istDateKey(unit.startsAt),
      startsAt: Timestamp.fromDate(unit.startsAt),
      endsAt: Timestamp.fromDate(unit.endsAt),
      appointmentId: appointmentRef?.id || null,
      blockId: null,
      kind: unit.kind,
      visitTypeId,
      holdId,
      expiresAt: expiresAt ? Timestamp.fromDate(asDate(expiresAt)) : null,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  return unitIds;
};

const releaseUnitsInTransaction = ({ db, transaction, slotIds }) => {
  (Array.isArray(slotIds) ? slotIds : []).forEach((slotId) => transaction.delete(db.collection('appointmentSlots').doc(slotId)));
};

/**
 * True when every unit the range covers (buffers included) is a live hold owned by
 * `claimHoldId`. A guest whose own hold is still alive may confirm a time that
 * availability already hides because of that same hold, so both `createBooking` and
 * `holdSlot` ask this before refusing a time.
 */
const unitsHeldBy = async ({
  db,
  doctorId,
  startsAt,
  endsAt,
  bufferBefore = 0,
  bufferAfter = 0,
  claimHoldId = null,
  now = new Date(),
}) => {
  if (!claimHoldId) return false;
  const start = asDate(startsAt);
  const end = asDate(endsAt);
  const units = unitSlotsForRange(
    doctorId,
    new Date(start.getTime() - bufferBefore * MINUTE_MS),
    new Date(end.getTime() + bufferAfter * MINUTE_MS),
  );
  if (!units.length) return false;
  const at = asMillis(now);
  const snapshots = await db.getAll(...units.map((unit) => db.collection('appointmentSlots').doc(unit.id)));
  return snapshots.every((snapshot) => snapshot.exists
    && snapshot.get('kind') === 'hold'
    && snapshot.get('holdId') === claimHoldId
    && (!snapshot.get('expiresAt') || asMillis(snapshot.get('expiresAt')) > at));
};

module.exports = { placeAppointmentInTransaction, releaseUnitsInTransaction, unitsHeldBy };
