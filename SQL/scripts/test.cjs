const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

if (process.env.FIREBASE_DATACONNECT_POSTGRESQL_STRING) {
  throw new Error('Refusing SQL tests with an external PostgreSQL connection; unset FIREBASE_DATACONNECT_POSTGRESQL_STRING.');
}

// firebase-tools 15.32.1 races its own SQL Connect emulator: its DataConnectEmulatorClient
// POSTs emulator/configure only ~4s after spawning the Go binary (MAX_RETRIES = 3, 2s apart),
// while a cold boot that always regenerates SDKs binds the HTTP port at ~3-6s. Losing that
// race aborts the whole emulators:exec run before any test executes. The retry budget is
// hard-coded in the installed CLI, so patch it here (idempotent, reapplied after npm ci).
const cliModule = path.resolve(__dirname, '../..', 'node_modules/firebase-tools/lib/emulator/dataconnectEmulator.js');
const PATCH_MARKER = 'FIREBASE_CLINIC_SQL_RETRY_PATCH';
const originalCli = fs.readFileSync(cliModule, 'utf-8');
if (!originalCli.includes(PATCH_MARKER) && originalCli.includes('const MAX_RETRIES = 3;')) {
  const patchedCli = originalCli
    .replace('const MAX_RETRIES = 3;', `/* ${PATCH_MARKER}: widen the /emulator/configure retry window */ const MAX_RETRIES = 12;`)
    .replace('await new Promise((resolve) => setTimeout(resolve, 2000));', 'await new Promise((resolve) => setTimeout(resolve, 1500));');
  if (patchedCli !== originalCli) fs.writeFileSync(cliModule, patchedCli);
}

// Losing the race (or any other emulator boot crash) aborts the whole run before tests
// execute, while each run gets a fresh emulator and test suites seed their own data, so
// rerunning the same command is safe. Treat only the configure-race error as retryable.
const RACE_PATTERN = /Failed to make request to .*\/emulator\/configure/i;
// Rehearsal mutations exist only in this temporary emulator configuration.
// A plain production deploy cannot accidentally include the synthetic connector.
const root = path.resolve(__dirname, '../..');
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sood-sql-tests-'));
const source = path.join(root, 'SQL/dataconnect');
for (const name of ['schema', 'admin', 'clinic']) fs.cpSync(path.join(source, name), path.join(testDir, name), { recursive: true });
fs.cpSync(path.join(source, 'deferred/connectors/rehearsal'), path.join(testDir, 'rehearsal'), { recursive: true });
for (const [name, output] of [['admin', 'functions/generated/sql'], ['clinic', 'SQL/generated/clinic'], ['rehearsal', 'SQL/generated/rehearsal']]) {
  const file = path.join(testDir, name, 'connector.yaml');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(/outputDir: .*/, `outputDir: ${path.join(root, output)}`));
}
fs.writeFileSync(path.join(testDir, 'dataconnect.yaml'), fs.readFileSync(path.join(source, 'dataconnect.yaml'), 'utf8') + '\n  - ./rehearsal\n');
const firebase = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
const testConfig = path.join(testDir, 'firebase.json');
fs.writeFileSync(testConfig, JSON.stringify({ dataconnect: { source: testDir }, emulators: {
  ...firebase.emulators,
  ui: { enabled: false },
  hub: { host: '127.0.0.1', port: 4461 },
  logging: { host: '127.0.0.1', port: 4561 },
} }));
const argv = [
  require.resolve('firebase-tools/lib/bin/firebase'),
  'emulators:exec', '--only', 'auth,dataconnect', '--project', 'demo-sood-clinic',
  '--config', testConfig,
  '--non-interactive', `node --test ${path.join(root, 'SQL/tests/*.test.cjs')}`,
];
const options = {
  cwd: path.resolve(__dirname, '../..'),
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
  encoding: 'utf-8',
};

let lastResult = null;
try {
for (let attempt = 1; attempt <= 3; attempt++) {
  if (attempt > 1) {
    console.error(`Retrying SQL test run after emulator startup race (attempt ${attempt} of 3).`);
  }
  lastResult = spawnSync(process.execPath, argv, options);
  if (lastResult.error) throw lastResult.error;
  if (RACE_PATTERN.test(lastResult.stdout ?? '') || RACE_PATTERN.test(lastResult.stderr ?? '')) continue;
  break;
}
} finally {
  fs.rmSync(testDir, { recursive: true, force: true });
}
if (lastResult.stdout) process.stdout.write(lastResult.stdout);
if (lastResult.stderr) {
  // Un-stripe the ANSI labels from the streamed CLI lines so retry banners and the boot
  // log read normally in capture output.
  process.stderr.write(lastResult.stderr);
}
process.exitCode = lastResult.status ?? 1;
