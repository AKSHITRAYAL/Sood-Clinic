// Phase 6 SQL scheduler claim adapter. It is server-only and intentionally has
// no callable export until availability, holds, booking and release are reviewed
// as one cutover slice.
const { createHash } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');

const UNIT_CLAIM_LIMIT = 96;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
const HOLD_ID = /^[A-Za-z0-9_-]{16,64}$/;
const invalid = () => new HttpsError('invalid-argument', 'The appointment request is invalid. Please choose a time again.');

const iso = (value, error = invalid) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw error();
  return date.toISOString();
};

const uuid = (value, error = invalid) => {
  if (typeof value !== 'string' || !UUID.test(value)) throw error();
  return value.toLowerCase();
};

const digest = (value) => createHash('sha256').update(value).digest('hex');

function holdHash(holdId) {
  if (typeof holdId !== 'string' || !HOLD_ID.test(holdId)) throw invalid();
  return digest(holdId);
}

const safeText = (value, limit = 120) => typeof value === 'string' && value.length > 0 && value.length <= limit && !/[\x00-\x1f\x7f]/.test(value);

function claimVariables({
  actorUid,
  actorRole,
  doctorId,
  doctorLegacyId,
  requestId,
  auditAction,
  units,
  now,
  ownHoldHash = '',
  appointmentId = null,
  holdHash: targetHoldHash = null,
  expiresAt = null,
}) {
  if (!safeText(actorUid) || !safeText(actorRole, 40) || !safeText(doctorLegacyId, 120) || !safeText(auditAction, 120)
    || (ownHoldHash && !HASH.test(ownHoldHash)) || !Array.isArray(units) || units.length < 1 || units.length > UNIT_CLAIM_LIMIT) throw invalid();
  const normalizedDoctorId = uuid(doctorId); const normalizedRequestId = uuid(requestId);
  const isHold = targetHoldHash !== null;
  if (isHold === (appointmentId !== null) || (isHold && (!HASH.test(targetHoldHash) || expiresAt === null))) throw invalid();
  if ((!isHold && expiresAt !== null) || (isHold && ownHoldHash && ownHoldHash !== targetHoldHash)) throw invalid();
  const normalizedAppointmentId = appointmentId === null ? null : uuid(appointmentId);
  const normalizedExpiry = expiresAt === null ? null : iso(expiresAt);
  const claimedAt = iso(now);
  if (isHold && new Date(normalizedExpiry).getTime() <= new Date(claimedAt).getTime()) throw invalid();
  const seen = new Set();
  const normalized = units.map((unit) => {
    if (!unit || !safeText(unit.unitKey, 220) || seen.has(unit.unitKey) || !['hold', 'core', 'buffer'].includes(unit.kind)) throw invalid();
    if ((isHold && unit.kind !== 'hold') || (!isHold && unit.kind === 'hold')) throw invalid();
    seen.add(unit.unitKey);
    return { unitKey: unit.unitKey, unitAt: iso(unit.unitAt), kind: unit.kind };
  });
  const placeholders = Array.from({ length: UNIT_CLAIM_LIMIT - normalized.length }, (_, index) => ({
    unitKey: `__scheduler_unused_${normalizedRequestId}_${index}`,
    unitAt: claimedAt,
    kind: 'hold',
  }));
  const padded = [...normalized, ...placeholders];
  const operation = `scheduler_claim:${digest(JSON.stringify({ actorUid, actorRole, doctorId: normalizedDoctorId, doctorLegacyId, requestId: normalizedRequestId, auditAction, units: normalized, ownHoldHash, appointmentId: normalizedAppointmentId, holdHash: targetHoldHash, expiresAt: normalizedExpiry }))}`;
  return {
    actorUid,
    actorRole,
    doctorId: normalizedDoctorId,
    doctorLegacyId,
    requestId: normalizedRequestId,
    operation,
    auditAction,
    now: claimedAt,
    ownHoldHash,
    unitKeys: padded.map((unit) => unit.unitKey),
    unitAts: padded.map((unit) => unit.unitAt),
    kinds: padded.map((unit) => unit.kind),
    appointmentId: normalizedAppointmentId,
    holdHash: targetHoldHash,
    expiresAt: normalizedExpiry,
    ...Object.fromEntries(Array.from({ length: UNIT_CLAIM_LIMIT }, (_, index) => [`slot${index}`, index < normalized.length])),
  };
}

function createSqlSchedulerClaims({ store }) {
  if (!store || typeof store.claim !== 'function' || typeof store.releaseHold !== 'function' || typeof store.releaseAppointment !== 'function') {
    throw new Error('A complete scheduler SQL claim store is required.');
  }
  return Object.freeze({
    claim: async (input) => store.claim(claimVariables(input)),
    releaseHold: async ({ actorUid, actorRole, doctorId, doctorLegacyId, holdId, requestId }) => {
      if (!safeText(actorUid) || !safeText(actorRole, 40) || !safeText(doctorLegacyId, 120)) throw invalid();
      const normalizedRequestId = uuid(requestId); const normalizedDoctorId = uuid(doctorId); const hashed = holdHash(holdId);
      return store.releaseHold({ actorUid, actorRole, doctorId: normalizedDoctorId, doctorLegacyId, holdHash: hashed, requestId: normalizedRequestId,
        operation: `scheduler_release_hold:${digest(JSON.stringify({ actorUid, doctorId: normalizedDoctorId, doctorLegacyId, holdHash: hashed, requestId: normalizedRequestId }))}` });
    },
    releaseAppointment: async ({ actorUid, actorRole, doctorLegacyId, appointmentId, requestId, auditAction }) => {
      if (!safeText(actorUid) || !safeText(actorRole, 40) || !safeText(doctorLegacyId, 120) || !safeText(auditAction, 120)) throw invalid();
      const normalizedRequestId = uuid(requestId); const normalizedAppointmentId = uuid(appointmentId);
      return store.releaseAppointment({ actorUid, actorRole, doctorLegacyId, appointmentId: normalizedAppointmentId, requestId: normalizedRequestId, auditAction,
        operation: `scheduler_release_appointment:${digest(JSON.stringify({ actorUid, doctorLegacyId, appointmentId: normalizedAppointmentId, requestId: normalizedRequestId, auditAction }))}` });
    },
  });
}

function sqlSchedulerClaimStore(dc) {
  const { claimAppointmentUnits, releaseAppointmentUnits, releaseHoldUnits } = require('../generated/sql');
  return Object.freeze({
    claim: (data) => claimAppointmentUnits(dc, data),
    releaseHold: (data) => releaseHoldUnits(dc, data),
    releaseAppointment: (data) => releaseAppointmentUnits(dc, data),
  });
}

module.exports = { UNIT_CLAIM_LIMIT, claimVariables, createSqlSchedulerClaims, holdHash, sqlSchedulerClaimStore };
