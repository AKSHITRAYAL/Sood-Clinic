const fs = require('node:fs');
const path = require('node:path');

function releaseSourceBlockers(schema, operations, sdk) {
  const blockers = [];
  if (/RehearseBranchCompareAndSet|InspectBranchRehearsal/.test(operations)) blockers.push('SYNTHETIC_REHEARSAL_OPERATIONS_PRESENT');
  if (/rehearseBranchCompareAndSet|inspectBranchRehearsal/.test(sdk)) blockers.push('SYNTHETIC_REHEARSAL_SDK_PRESENT');
  // Conservative source check, not a replacement for compiled DDL/API review.
  const body = /^type Appointment\b[^\{]*\{([\s\S]*?)^\}/m.exec(schema)?.[1];
  const relation = body && /^\s*patient:\s*Patient(!?)(?:\s|$)/m.exec(body);
  if (!relation) blockers.push('APPOINTMENT_RELATION_SOURCE_UNRECOGNIZED');
  else if (relation[1] !== '!') blockers.push('GUEST_RELATION_RELEASE_REVIEW_REQUIRED');
  return blockers;
}
function checkLocalReleaseSources() {
  const root = path.resolve(__dirname, '../..');
  const admin = path.join(root, 'SQL/dataconnect/admin');
  return releaseSourceBlockers(
    fs.readFileSync(path.join(root, 'SQL/dataconnect/schema/schema.gql'), 'utf8'),
    fs.readdirSync(admin).filter(name => name.endsWith('.gql')).sort().map(name => fs.readFileSync(path.join(admin, name), 'utf8')).join('\n'),
    ['index.cjs.js', 'esm/index.esm.js', 'index.d.ts'].map(name => fs.readFileSync(path.join(root, 'functions/generated/sql', name), 'utf8')).join('\n'),
  );
}
if (require.main === module) {
  try {
    if (process.argv.length !== 2) throw new Error();
    const blockers = checkLocalReleaseSources();
    console.log(JSON.stringify({ mode: 'local_source_check', blockers, productionApproved: false }));
    process.exitCode = blockers.length ? 1 : 0;
  } catch {
    console.error('RELEASE_SOURCE_CHECK_FAILED'); process.exitCode = 1;
  }
}
module.exports = { releaseSourceBlockers, checkLocalReleaseSources };
