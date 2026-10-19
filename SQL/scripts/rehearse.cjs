// No SDK imports, input-file option, credentials, network calls or write mode.
const { rehearse } = require('../migration/rehearsal.cjs');
const { fixtures } = require('../migration/fixtures.cjs');
try {
  if (process.argv.length !== 2) throw new Error('UNSUPPORTED_ARGUMENTS');
  for (const key of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT', 'GCP_PROJECT']) {
    if (process.env[key] && process.env[key] !== 'demo-sood-clinic') throw new Error('UNSAFE_ENVIRONMENT');
  }
  if (process.env.FIREBASE_CONFIG) {
    const config = JSON.parse(process.env.FIREBASE_CONFIG);
    if (config.projectId !== 'demo-sood-clinic') throw new Error('UNSAFE_ENVIRONMENT');
  }
  if (process.env.FIREBASE_DATACONNECT_POSTGRESQL_STRING || process.env.DATABASE_URL || process.env.PGHOST || process.env.PGSERVICE) throw new Error('UNSAFE_ENVIRONMENT');
  for (const key of ['DATA_CONNECT_EMULATOR_HOST', 'FIREBASE_DATA_CONNECT_EMULATOR_HOST']) {
    if (process.env[key] && process.env[key] !== '127.0.0.1:9399') throw new Error('UNSAFE_ENVIRONMENT');
  }
  console.log(JSON.stringify({ dataset: 'built_in_synthetic', ...rehearse(fixtures) }));
} catch {
  console.error('Rehearsal refused: use synthetic fixtures in a local-only environment with no arguments or database overrides.');
  process.exitCode = 1;
}
