// Phase 6 server-only hold orchestration. It remains unmounted until the full
// scheduler booking/cancel/reschedule slice is reviewed together.
const { randomBytes } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { unitSlotsForRange } = require('./engine/units');
const { holdHash } = require('./sqlSchedulerClaims');

const HOLD_MINUTES = 5;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_ID = /^[A-Za-z0-9_-]{2,80}$/;
const invalid = () => new HttpsError('invalid-argument', 'Please choose an available appointment time.');
const unavailable = () => new HttpsError('failed-precondition', 'That appointment time is no longer available. Please choose another time.');
const validDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

function createSqlSchedulerHolds({ availability, claims, now = () => new Date(), newHoldId = () => randomBytes(24).toString('base64url') }) {
  if (!availability || typeof availability.getDay !== 'function' || !claims || typeof claims.claim !== 'function') {
    throw new Error('Complete scheduler availability and claim adapters are required.');
  }
  return Object.freeze({
    async place({ actorUid, actorRole, doctorId, doctorLegacyId, dateKey, time, visitType, requestId }) {
      if (typeof actorUid !== 'string' || !actorUid || typeof actorRole !== 'string' || !actorRole
        || !UUID.test(doctorId || '') || !LEGACY_ID.test(doctorLegacyId || '') || !TIME.test(time || '')) throw invalid();
      // Buffers and the clock are checked before any read, so a malformed request
      // never costs a SQL round trip.
      const before = visitType?.bufferBeforeMinutes ?? 0;
      const after = visitType?.bufferAfterMinutes ?? 0;
      if (!Number.isInteger(before) || !Number.isInteger(after) || before < 0 || after < 0) throw invalid();
      const current = now();
      if (!validDate(current)) throw new Error('Scheduler clock must return a valid Date.');
      const day = await availability.getDay({ actorUid, doctorLegacyId, dateKey, visitType });
      const slot = day.slots.find((candidate) => candidate.time === time);
      if (!slot) throw unavailable();
      const startsAt = new Date(slot.startsAt.getTime() - before * 60_000);
      const endsAt = new Date(slot.endsAt.getTime() + after * 60_000);
      const holdId = newHoldId();
      if (typeof holdId !== 'string' || !/^[A-Za-z0-9_-]{16,64}$/.test(holdId)) throw new Error('Hold generator must return a secure URL-safe token.');
      const expiresAt = new Date(current.getTime() + HOLD_MINUTES * 60_000);
      await claims.claim({
        actorUid, actorRole, doctorId, doctorLegacyId, requestId, auditAction: 'scheduler_hold_placed', now: current,
        units: unitSlotsForRange(doctorLegacyId, startsAt, endsAt).map((unit) => ({ unitKey: unit.id, unitAt: unit.startsAt, kind: 'hold' })),
        holdHash: holdHash(holdId), expiresAt,
      });
      return { holdId, expiresAt: expiresAt.toISOString(), dateKey, time };
    },
  });
}

module.exports = { HOLD_MINUTES, createSqlSchedulerHolds };
