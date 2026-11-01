const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const group = process.argv[2] || 'booking';
if (!['booking', 'callables'].includes(group) || process.argv.length > 3) throw new Error('Select booking or callables.');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sood-booking-tests-'));
try {
  // Test a source copy with dummy Calendar secrets; never fetch real credentials
  // or overwrite a developer's .secret.local while running emulator tests.
  const source = path.join(root, 'functions');
  const copied = path.join(dir, 'functions');
  fs.mkdirSync(copied);
  function copyCode(from, to) {
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.isSymbolicLink()) continue;
      const input = path.join(from, entry.name); const output = path.join(to, entry.name);
      if (entry.isDirectory()) { fs.mkdirSync(output); copyCode(input, output); }
      else if (/\.(?:js|cjs|mjs)$/.test(entry.name) || entry.name === 'package.json') fs.copyFileSync(input, output);
    }
  }
  copyCode(source, copied);
  fs.symlinkSync(path.join(source, 'node_modules'), path.join(copied, 'node_modules'), 'dir');
  fs.writeFileSync(path.join(copied, '.secret.local'), 'GOOGLE_CALENDAR_CLIENT_ID=emulator-only\nGOOGLE_CALENDAR_CLIENT_SECRET=emulator-only\nGOOGLE_CALENDAR_TOKEN_KEY=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\n', { mode: 0o600 });
  const config = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
  config.functions = { source: 'functions' };
  const sqlSource = path.join(root, config.dataconnect.source);
  const sqlCopy = path.join(dir, 'dataconnect');
  fs.mkdirSync(sqlCopy);
  for (const name of ['schema', 'admin', 'clinic']) fs.cpSync(path.join(sqlSource, name), path.join(sqlCopy, name), { recursive: true });
  fs.copyFileSync(path.join(sqlSource, 'dataconnect.yaml'), path.join(sqlCopy, 'dataconnect.yaml'));
  for (const [name, output] of [['admin', 'functions/generated/sql'], ['clinic', 'SQL/generated/clinic']]) {
    const yaml = path.join(sqlCopy, name, 'connector.yaml');
    fs.writeFileSync(yaml, fs.readFileSync(yaml, 'utf8').replace(/outputDir: .*/, `outputDir: ${path.join(root, output)}`));
  }
  config.dataconnect.source = 'dataconnect';
  fs.copyFileSync(path.join(root, config.firestore.rules), path.join(dir, 'firestore.rules'));
  fs.copyFileSync(path.join(root, config.firestore.indexes), path.join(dir, 'firestore.indexes.json'));
  config.firestore.rules = 'firestore.rules';
  config.firestore.indexes = 'firestore.indexes.json';
  config.emulators = { ...config.emulators, ui: { enabled: false }, hub: { host: '127.0.0.1', port: 4462 }, logging: { host: '127.0.0.1', port: 4562 } };
  const file = path.join(dir, 'firebase.json');
  fs.writeFileSync(file, JSON.stringify(config));
  const command = group === 'booking' ? 'vitest run --no-file-parallelism tests/booking/*.test.js' : 'vitest run --no-file-parallelism tests/callables';
  const result = spawnSync(process.execPath, [require.resolve('firebase-tools/lib/bin/firebase'), 'emulators:exec', '--only', 'auth,firestore,functions,dataconnect', '--project', 'demo-sood-clinic', '--config', file, '--non-interactive', command], {
    cwd: root, stdio: 'inherit',
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1', XDG_CONFIG_HOME: path.join(dir, 'config'), FIREBASE_DEBUG_PATH: path.join(dir, 'firebase-debug.log') },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
