// Phase 6 public hold callable — staged, NOT exported from functions/index.js.
// The Phase 6 gate (SQL/phase 6.md) requires the whole holds/booking/cancel/
// reschedule slice to be reviewed together, and this path has no per-caller rate
// limiter yet, so it must not reach a deployed Functions revision on its own.
const { HttpsError } = require('firebase-functions/v2/https');
const { isStaffRole } = require('./staffAccess');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DOCTOR = /^[A-Za-z0-9_-]{2,80}$/;
const invalid = (message = 'Choose an available appointment time.') => new HttpsError('invalid-argument', message);

// Guests are the normal caller for a public hold, so a missing Auth identity is
// not an error; the SQL audit row carries `guest` plus the request id. Everything
// the handler writes is derived here, never taken from the request body.
function createSchedulerHoldHandler({ holds, resolveDoctor }) {
  if (!holds || typeof holds.place !== 'function' || typeof resolveDoctor !== 'function') {
    throw new Error('A scheduler hold service and a doctor resolver are required.');
  }
  return async function schedulerHold(request) {
    // A public write path only accepts a verified app: `request.app` is trusted
    // callable-runtime context (never `request.data.app`), same rule as the SQL
    // patient backends, and a token may only be used once.
    if (typeof request?.app?.appId !== 'string' || !request.app.appId || request.app.alreadyConsumed === true) throw new HttpsError('failed-precondition', 'This request could not be verified. Please reload the page.');
    const data = request.data || {};
    const doctorLegacyId = typeof data.doctorId === 'string' ? data.doctorId.trim() : '';
    const dateKey = typeof data.dateKey === 'string' ? data.dateKey : '';
    const time = typeof data.time === 'string' ? data.time : '';
    const requestId = typeof data.clientRequestId === 'string' ? data.clientRequestId : '';
    const visitTypeId = data.visitTypeId == null || data.visitTypeId === '' ? null : String(data.visitTypeId);
    if (!DOCTOR.test(doctorLegacyId) || !DATE_KEY.test(dateKey) || !TIME.test(time)) throw invalid();
    if (!UUID.test(requestId)) throw invalid('Please reload the page and choose a time again.');
    if (visitTypeId !== null && (visitTypeId.length > 64 || /[\x00-\x1f\x7f]/.test(visitTypeId))) throw invalid();

    // The resolver needs the same bounded day range the claim will use, and the
    // SQL read is keyed by actor, so both come from the verified request.
    const { doctorId, visitType } = await resolveDoctor({ actorUid: request.auth?.uid || 'guest', doctorLegacyId, visitTypeId, dateKey });
    if (!UUID.test(String(doctorId || '')) || !visitType || !Number.isInteger(visitType.minutes) || visitType.minutes < 5) {
      throw invalid('That doctor is not currently offered for online booking.');
    }
    for (const key of ['bufferBeforeMinutes', 'bufferAfterMinutes']) {
      if (visitType[key] != null && (!Number.isInteger(visitType[key]) || visitType[key] < 0)) throw invalid();
    }

    const role = request.auth?.token?.role;
    try {
      const held = await holds.place({
        actorUid: request.auth?.uid || 'guest',
        actorRole: isStaffRole(role) ? role : 'patient',
        doctorId: String(doctorId).toLowerCase(),
        doctorLegacyId,
        dateKey,
        time,
        visitType,
        requestId: requestId.toLowerCase(),
      });
      // The raw token is the caller's only handle on the hold; it is deliberately
      // returned once and never stored or logged in clear.
      return { holdId: held.holdId, expiresAt: held.expiresAt, dateKey: held.dateKey, time: held.time };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      // Do not leak SQL/driver detail to a public caller.
      throw new HttpsError('unavailable', 'Appointment holds are temporarily unavailable. Please try again.');
    }
  };
}

module.exports = { createSchedulerHoldHandler };
