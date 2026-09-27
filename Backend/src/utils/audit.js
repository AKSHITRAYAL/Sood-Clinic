const AuditEvent = require('../models/AuditEvent');

async function audit({ actor, action, entityType, entityId, branch, metadata = {} }) {
  await AuditEvent.create({ actor: actor || null, action, entityType, entityId: entityId || null, branch: branch || null, metadata });
}

module.exports = { audit };
