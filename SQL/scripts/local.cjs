const { createRequire } = require('node:module');
const path = require('node:path');
const functionsRequire = createRequire(path.resolve(__dirname, '../../functions/package.json'));

function localDataConnect(connectorName = 'clinic-admin') {
  const host = process.env.DATA_CONNECT_EMULATOR_HOST || process.env.FIREBASE_DATA_CONNECT_EMULATOR_HOST;
  const projectId = process.env.GCLOUD_PROJECT;
  if (host !== '127.0.0.1:9399' || projectId !== 'demo-sood-clinic') {
    throw new Error('Refusing SQL fixtures/tests: require the demo-sood-clinic emulator on 127.0.0.1:9399. Run npm run sql:test.');
  }
  process.env.DATA_CONNECT_EMULATOR_HOST = host;
  const { initializeApp, getApps } = functionsRequire('firebase-admin/app');
  const { getDataConnect } = functionsRequire('firebase-admin/data-connect');
  // Admin SDK 13 caches by service, ignoring connector; isolate per connector.
  const appName = `sql-local-${connectorName}`;
  const app = getApps().find((item) => item.name === appName) || initializeApp({ projectId }, appName);
  return getDataConnect({ serviceId: 'ak-sood-clinic-service', location: 'asia-south1', connector: connectorName }, app);
}

async function seed() {
  const dc = localDataConnect();
  const { seedFoundation } = require('../../functions/generated/sql');
  return seedFoundation(dc);
}

module.exports = { localDataConnect, seed, functionsRequire };
