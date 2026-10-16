const isExpiredHold = (unit, now) => unit?.kind === 'hold'
  && unit.expiresAt
  && new Date(unit.expiresAt).getTime() <= now.getTime();

/**
 * A unit the caller already owns is not a conflict: a guest may claim the units its
 * own hold locked, and a rescheduled or moved appointment may keep the units it
 * already holds (the overlapping set is released by the caller afterwards).
 */
const isClaimed = (unit, { claimHoldId, claimAppointmentId }) => {
  if (claimAppointmentId && unit.appointmentId && unit.appointmentId === claimAppointmentId) return true;
  if (claimHoldId && unit.kind === 'hold' && unit.holdId && unit.holdId === claimHoldId) return true;
  return false;
};

const planPlacement = ({ candidateUnitIds, existingUnits, now, claimHoldId = null, claimAppointmentId = null }) => {
  for (const unitId of candidateUnitIds) {
    const existing = existingUnits instanceof Map ? existingUnits.get(unitId) : existingUnits?.[unitId];
    if (!existing || isExpiredHold(existing, now) || isClaimed(existing, { claimHoldId, claimAppointmentId })) continue;
    return { ok: false, conflictUnitId: unitId };
  }
  return { ok: true };
};

module.exports = { planPlacement };
