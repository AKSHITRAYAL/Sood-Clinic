// Deployment tooling only. Credentials remain in Firebase CLI's local store.
const auth = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { Client } = require('firebase-tools/lib/apiv2');

async function cloudOptions() {
  if (process.env.DATA_CONNECT_EMULATOR_HOST || process.env.FIREBASE_DATA_CONNECT_EMULATOR_HOST) {
    throw new Error('Cloud operation refused while an emulator override is set.');
  }
  const options = { project: 'sood-clinic', projectRoot: process.cwd(), nonInteractive: true };
  const account = auth.getProjectDefaultAccount(process.cwd());
  if (!account) throw new Error('Sign in to the Firebase CLI before the SQL release.');
  auth.setActiveAccount(options, account);
  await requireAuth(options);
  return options;
}

async function cloudConnector(connector = 'clinic-admin') {
  await cloudOptions();
  const client = new Client({ urlPrefix: 'https://firebasedataconnect.googleapis.com', apiVersion: 'v1', auth: true });
  const resource = `/projects/sood-clinic/locations/asia-south1/services/ak-sood-clinic-service/connectors/${connector}`;
  return async (kind, operationName, variables, impersonate) => {
    if (!['Query', 'Mutation'].includes(kind)) throw new Error('Invalid operation kind.');
    const result = await client.post(`${resource}:impersonate${kind}`, {
      operationName, variables, extensions: impersonate ? { impersonate } : undefined,
    });
    if (result.body.errors?.length) throw new Error(result.body.errors.map((item) => item.message).join('; '));
    return result.body.data;
  };
}

// Reuse the CLI's IAM connection: no database password or new IAM grants.
async function cloudSql(statements, { transaction = false } = {}) {
  if (!Array.isArray(statements) || !statements.length) throw new Error('SQL statements are required.');
  const options = await cloudOptions();
  const { executeSqlCmdsAsIamUser } = require('firebase-tools/lib/gcp/cloudsql/connect');
  return executeSqlCmdsAsIamUser(options, 'ak-sood-clinic-instance', 'ak-sood-clinic-database', [...statements], true, transaction);
}

async function cloudPublicCatalogue(path) {
  if (!['branches', 'departments', 'doctors', 'clinic/publicConfig', 'clinic/consultationPolicy'].includes(path)) {
    throw new Error('Only published catalogue and booking configuration may be read.');
  }
  await cloudOptions();
  const client = new Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1', auth: true });
  const resource = `/projects/sood-clinic/databases/(default)/documents/${path}`;
  return (await client.get(resource, { queryParams: path.startsWith('clinic/') ? {} : { pageSize: 1000 } })).body;
}

async function cloudMigrationCounts() {
  await cloudOptions();
  const client = new Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1', auth: true });
  const collections = ['patients', 'appointments', 'consultationRequests', 'appointmentProposals', 'doctorSchedules', 'scheduleExceptions', 'patientFeedback', 'medicalHistory', 'medicalDocuments'];
  return Object.fromEntries(await Promise.all(collections.map(async collectionId => {
    const result = await client.post('/projects/sood-clinic/databases/(default)/documents:runAggregationQuery', {
      structuredAggregationQuery: {
        structuredQuery: { from: [{ collectionId, allDescendants: true }] },
        aggregations: [{ alias: 'total', count: {} }],
      },
    });
    const total = Number(result.body[0]?.result?.aggregateFields?.total?.integerValue);
    if (!Number.isSafeInteger(total) || total < 0) throw new Error('SOURCE_CENSUS_INCOMPLETE');
    return [collectionId, total];
  })));
}

module.exports = { cloudConnector, cloudSql, cloudPublicCatalogue, cloudMigrationCounts };
