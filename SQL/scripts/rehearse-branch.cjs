const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { localDataConnect } = require('./local.cjs');
const { createHash } = require('node:crypto');
const { encodeInstant } = require('../migration/instant-preservation.cjs');
const { timestampNanos } = require('../migration/rehearsal.cjs');
// The rehearsal operations live in the local-only clinic-rehearsal connector, never in
// the deployable clinic-admin SDK. The generated SDK is written outside functions/, so
// bind its firebase-admin import to the functions dependency tree rather than adding a
// second copy or a node_modules symlink.
const sdkPath = path.resolve(__dirname, '../generated/rehearsal/index.cjs.js');
const sdk = new Module(sdkPath, module);
sdk.filename = sdkPath;
sdk.require = Module.createRequire(path.resolve(__dirname, '../../functions/package.json'));
sdk._compile(fs.readFileSync(sdkPath, 'utf8'), sdkPath);
const { rehearseBranchCompareAndSet, inspectBranchRehearsal } = sdk.exports;
const branchId = '00000000-0000-4000-8000-000000009001';

async function rehearseBranchStep(input) {
  // This driver must never become a production importer or accept arbitrary row IDs.
  const dc = localDataConnect('clinic-rehearsal');
  if (process.env.FIREBASE_DATACONNECT_POSTGRESQL_STRING) throw new Error('REHEARSAL_ENVIRONMENT_REJECTED');
  let variables;
  try {
    if (!input || Object.keys(input).sort().join(',') !== 'action,expectedAt,expectedName,name,requestId,sourceInstant' || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(input.requestId) || !['apply', 'restore'].includes(input.action) || ![input.name, input.expectedName].every(value => typeof value === 'string' && /^Synthetic [A-Za-z0-9 -]{1,70}$/.test(value))) throw new Error();
    const time = encodeInstant(input.sourceInstant); const expected = encodeInstant(input.expectedAt);
    if (timestampNanos(input.expectedAt) % 1000n || timestampNanos(time.sqlValue) <= timestampNanos(expected.sqlValue)) throw new Error();
    const payload = { ...input, sourceInstant: time.exactValue, expectedAt: expected.sqlValue };
    variables = { requestId: input.requestId, expectedName: input.expectedName, expectedAt: expected.sqlValue, name: input.name, updatedAt: time.sqlValue, exactValue: time.exactValue, action: `migration_rehearsal_${input.action}`, operation: `rehearsal:${createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(payload).sort()))).digest('hex')}` };
  } catch { throw new Error('REHEARSAL_INPUT_REJECTED'); }
  try {
    await rehearseBranchCompareAndSet(dc, variables);
    return { status: 'applied', applied: 1, replayed: 0, productionReady: false };
  } catch (error) {
    let state;
    try { state = (await inspectBranchRehearsal(dc, { requestId: variables.requestId })).data; }
    catch { throw new Error('REHEARSAL_STATE_UNCERTAIN'); }
    if (!state.operationReceipt) throw new Error(/REHEARSAL_STALE_CONTENT_OR_VERSION/.test(error.message || '') ? 'REHEARSAL_WRITE_REJECTED' : 'REHEARSAL_STATE_UNCERTAIN');
    if (state.operationReceipt.operation !== variables.operation) throw new Error('REHEARSAL_REQUEST_REUSE_CONFLICT');
    if (state.branch?.name !== variables.name || state.branch.code !== 'SQL-REHEARSAL-ONLY' || state.branch.active !== false || !state.branch.updatedAt || timestampNanos(state.branch.updatedAt) !== timestampNanos(variables.updatedAt) || state.legacySourceInstant?.exactValue !== variables.exactValue || state.legacySourceInstant.sourcePath !== 'synthetic/migration-rehearsal' || !state.legacySourceInstant.sqlValue || timestampNanos(state.legacySourceInstant.sqlValue) !== timestampNanos(variables.updatedAt) || state.auditLog?.action !== variables.action || state.auditLog.actorUid !== 'migration-rehearsal' || state.auditLog.actorRole !== 'system' || state.auditLog.resourceId !== branchId || state.auditLog.resourceType !== 'synthetic_branch') throw new Error('REHEARSAL_REPLAY_STATE_CHANGED');
    return { status: 'replayed', applied: 0, replayed: 1, productionReady: false };
  }
}
module.exports = { rehearseBranchStep, branchId };
