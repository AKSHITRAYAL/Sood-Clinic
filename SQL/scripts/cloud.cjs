// Deployment tooling only. Credentials remain in Firebase CLI's local store.
const auth = require('firebase-tools/lib/auth');
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { Client } = require('firebase-tools/lib/apiv2');

async function cloudConnector(connector = 'clinic-admin') {
  if (process.env.DATA_CONNECT_EMULATOR_HOST || process.env.FIREBASE_DATA_CONNECT_EMULATOR_HOST) {
    throw new Error('Cloud operation refused while an emulator override is set.');
  }
  const options = { project: 'sood-clinic', projectRoot: process.cwd(), nonInteractive: true };
  const account = auth.getProjectDefaultAccount(process.cwd());
  if (!account) throw new Error('Sign in to the Firebase CLI before the SQL release.');
  auth.setActiveAccount(options, account);
  await requireAuth(options);
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

module.exports = { cloudConnector };
