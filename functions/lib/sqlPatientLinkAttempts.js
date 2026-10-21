const { HttpsError } = require('firebase-functions/v2/https');
const unavailable = () => new HttpsError('unavailable', 'Clinic linking could not be verified. Please retry later.');
const safeId = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\s\x00-\x1f\x7f]/.test(value);

// Exactly one durable debit per submitted attempt, including malformed codes.
// Lost acknowledgements are not retried: a committed debit must remain counted.
function createSqlPatientLinkAttemptGuard({ consumeAttempt }) {
  return async input => {
    if (!input || Array.isArray(input) || Object.keys(input).some(key => !['actorUid', 'appId'].includes(key))
      || !safeId(input.actorUid, 128) || !safeId(input.appId, 256) || typeof consumeAttempt !== 'function') throw unavailable();
    try {
      const result = await consumeAttempt({ actorUid: input.actorUid });
      if (result?.data?.user_updateMany !== 1 || typeof result.data.auditLog_insert?.id !== 'string'
        || !/^(?:[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})$/i.test(result.data.auditLog_insert.id)) throw unavailable();
      return true;
    } catch (error) {
      if (typeof error?.message === 'string' && error.message.includes('LINK_ATTEMPT_LIMIT')) return false;
      throw unavailable();
    }
  };
}

function sqlPatientLinkAttemptGuard(dc) {
  // Missing generated/deployed operation fails closed; never replace with true.
  const sdk = require('../generated/sql');
  return createSqlPatientLinkAttemptGuard({ consumeAttempt: data => {
    if (typeof sdk.consumePatientLinkAttempt !== 'function') throw unavailable();
    return sdk.consumePatientLinkAttempt(dc, data);
  } });
}
module.exports = { createSqlPatientLinkAttemptGuard, sqlPatientLinkAttemptGuard };
