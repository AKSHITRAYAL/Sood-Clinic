const { createSqlPatientHandlers, sqlPatientCallableOptions } = require('./sqlPatientHandlers');
const { sqlPatientLinkAttemptGuard } = require('./sqlPatientLinkAttempts');

// Staged composition, not a Functions export or permission to cut over portals.
// The release must supply its configured admin SQL connector and Admin Auth.
function createSqlPatientBackend({ auth, dc }) {
  return createSqlPatientHandlers({ auth, dc, checkLinkAttempt: sqlPatientLinkAttemptGuard(dc) });
}
module.exports = { createSqlPatientBackend, sqlPatientCallableOptions };
