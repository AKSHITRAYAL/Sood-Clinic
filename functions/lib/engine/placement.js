// Unit docs are read back from Firestore, where `expiresAt` is a Timestamp, but the same
// code is called with plain Dates in tests. `new Date(timestamp)` is an Invalid Date, so
// coercing properly is what makes an expired hold stop blocking a booking.
const asMillis = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
};

const isExpiredHold = (unit, now) => unit?.kind === 'hold'
  && unit.expiresAt
  && asMillis(unit.expiresAt) <= asMillis(now);

/**
 * A unit the caller already owns is not a conflict: a guest may claim the units its
 * own hold locked, and a rescheduled or moved appointment may keep the units it
 * already holds (the overlapping set is released by the caller afterwards).
 */
const isClaimed = (unit, { claimHoldHash, claimAppointmentId }) => {
  if (claimAppointmentId && unit.appointmentId && unit.appointmentId === claimAppointmentId) return true;
  // SQL stores only the SHA-256 of a holdId; callers pass the hash.
  if (claimHoldHash && unit.kind === 'hold' && unit.holdHash && unit.holdHash === claimHoldHash) return true;
  return false;
};

const planPlacement = ({ candidateUnitIds, existingUnits, now, claimHoldHash = null, claimAppointmentId = null }) => {
  for (const unitId of candidateUnitIds) {
    const existing = existingUnits instanceof Map ? existingUnits.get(unitId) : existingUnits?.[unitId];
    if (!existing || isExpiredHold(existing, now) || isClaimed(existing, { claimHoldHash, claimAppointmentId })) continue;
    return { ok: false, conflictUnitId: unitId };
  }
  return { ok: true };
};

module.exports = { asMillis, planPlacement };
