const fs = require('node:fs');
const path = require('node:path');

const REHEARSAL_OPERATIONS = /RehearseBranchCompareAndSet|InspectBranchRehearsal/;
const REHEARSAL_SDK = /rehearseBranchCompareAndSet|inspectBranchRehearsal/;
// A documented owner decision must state all four guest-relation facts to replace the
// "unreviewed nullable relation" blocker.
const POLICY_REQUIRED = [
  ['guestsAllowed', true],
  ['appointmentPatientNullable', true],
  ['guestDataInPrivateDetails', true],
  ['publicSqlAppointmentWriterReleased', false],
];

function releaseSourceBlockers({ schema, connectors = {}, dirs = [], sdk = '', plan = {} } = {}) {
  const blockers = [];
  const deployable = Array.isArray(plan.deployableConnectors) ? plan.deployableConnectors : [];
  if (!deployable.length) blockers.push('RELEASE_PLAN_UNREADABLE');
  for (const name of deployable) {
    if (REHEARSAL_OPERATIONS.test(connectors[name] ?? '')) blockers.push('SYNTHETIC_REHEARSAL_OPERATIONS_PRESENT');
  }
  if (REHEARSAL_SDK.test(sdk)) blockers.push('SYNTHETIC_REHEARSAL_SDK_PRESENT');
  // Every connector the emulator serves must be either released or explicitly excluded.
  const excluded = plan.excludedConnectors ?? {};
  for (const dir of dirs) if (!deployable.includes(dir) && !Object.hasOwn(excluded, dir)) blockers.push('UNACCOUNTED_CONNECTOR');
  // Conservative source check, not a replacement for compiled DDL/API review.
  const body = /^type Appointment\b[^\{]*\{([\s\S]*?)^\}/m.exec(schema)?.[1];
  const relation = body && /^\s*patient:\s*Patient(!?)(?:\s|$)/m.exec(body);
  if (!relation) blockers.push('APPOINTMENT_RELATION_SOURCE_UNRECOGNIZED');
  else if (relation[1] !== '!') {
    const policy = plan.guestRelation ?? {};
    if (policy.status !== 'approved') blockers.push('GUEST_RELATION_RELEASE_REVIEW_REQUIRED');
    else if (POLICY_REQUIRED.some(([field, value]) => policy[field] !== value)) blockers.push('GUEST_RELATION_POLICY_INCOMPLETE');
  }
  return [...new Set(blockers)];
}

function checkLocalReleaseSources() {
  const root = path.resolve(__dirname, '../..');
  const dataconnect = path.join(root, 'SQL/dataconnect');
  const dirs = [...fs.readFileSync(path.join(dataconnect, 'dataconnect.yaml'), 'utf8')
    .matchAll(/^\s*-\s*\.\/([\w-]+)\s*$/gm)].map(match => match[1]);
  const readAll = (dir, extensions) => fs.readdirSync(path.join(dataconnect, dir))
    .filter(name => extensions.some(extension => name.endsWith(extension))).sort()
    .map(name => fs.readFileSync(path.join(dataconnect, dir, name), 'utf8')).join('\n');
  const plan = JSON.parse(fs.readFileSync(path.join(root, 'SQL/release/plan.json'), 'utf8'));
  return {
    plan,
    dirs,
    blockers: releaseSourceBlockers({
      schema: fs.readFileSync(path.join(dataconnect, 'schema/schema.gql'), 'utf8'),
      connectors: Object.fromEntries(dirs.map(dir => [dir, readAll(dir, ['.gql'])])),
      dirs,
      sdk: ['index.cjs.js', 'esm/index.esm.js', 'index.d.ts']
        .map(name => fs.readFileSync(path.join(root, 'functions/generated/sql', name), 'utf8')).join('\n'),
      plan,
    }),
  };
}

if (require.main === module) {
  try {
    if (process.argv.length !== 2) throw new Error();
    const { blockers, plan, dirs } = checkLocalReleaseSources();
    console.log(JSON.stringify({
      mode: 'local_source_check',
      deployableConnectors: plan.deployableConnectors,
      excludedConnectors: dirs.filter(dir => !plan.deployableConnectors.includes(dir)),
      productionSchemaTransitionReviewed: plan.guestRelation?.productionSchemaTransitionReviewed === true,
      blockers,
      productionApproved: false,
    }));
    process.exitCode = blockers.length ? 1 : 0;
  } catch {
    console.error('RELEASE_SOURCE_CHECK_FAILED'); process.exitCode = 1;
  }
}
module.exports = { releaseSourceBlockers, checkLocalReleaseSources };
