const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

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
const argv = [
  require.resolve('firebase-tools/lib/bin/firebase'),
  'emulators:exec', '--only', 'auth,dataconnect', '--project', 'demo-sood-clinic',
  '--non-interactive', 'node --test SQL/tests/*.test.cjs',
];
const options = {
  cwd: path.resolve(__dirname, '../..'),
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
  encoding: 'utf-8',
};

let lastResult = null;
for (let attempt = 1; attempt <= 3; attempt++) {
  if (attempt > 1) {
    console.error(`Retrying SQL test run after emulator startup race (attempt ${attempt} of 3).`);
  }
  lastResult = spawnSync(process.execPath, argv, options);
  if (lastResult.error) throw lastResult.error;
  if (RACE_PATTERN.test(lastResult.stdout ?? '') || RACE_PATTERN.test(lastResult.stderr ?? '')) continue;
  break;
}
if (lastResult.stdout) process.stdout.write(lastResult.stdout);
if (lastResult.stderr) {
  // Un-stripe the ANSI labels from the streamed CLI lines so retry banners and the boot
  // log read normally in capture output.
  process.stderr.write(lastResult.stderr);
}
process.exitCode = lastResult.status ?? 1;
