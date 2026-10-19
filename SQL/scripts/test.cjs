const { spawnSync } = require('node:child_process');
const path = require('node:path');

if (process.env.FIREBASE_DATACONNECT_POSTGRESQL_STRING) {
  throw new Error('Refusing SQL tests with an external PostgreSQL connection; unset FIREBASE_DATACONNECT_POSTGRESQL_STRING.');
}
const result = spawnSync(process.execPath, [
  require.resolve('firebase-tools/lib/bin/firebase'),
  'emulators:exec', '--only', 'auth,dataconnect', '--project', 'demo-sood-clinic',
  '--non-interactive', 'node --test SQL/tests/*.test.cjs',
], {
  cwd: path.resolve(__dirname, '../..'),
  stdio: 'inherit',
  env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
