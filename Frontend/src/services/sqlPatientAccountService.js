import { getDataConnect } from 'firebase/data-connect';
import { getOwnSqlProfile, saveOwnSqlProfile, connectorConfig } from '../../../SQL/generated/clinic/esm/index.esm.js';
import { auth, firebaseApp } from '../lib/firebase';

function denied() {
  const error = new Error('Sign in again with a verified patient account.');
  error.code = 'patient-account/permission-denied';
  return error;
}
async function currentPatient(accountUid) {
  const user = auth.currentUser;
  if (!user || user.uid !== accountUid) throw denied();
  await user.reload();
  const token = await user.getIdTokenResult(true);
  if (auth.currentUser?.uid !== accountUid || !user.emailVerified || token.claims.email_verified !== true
    || ['admin', 'manager', 'doctor'].includes(token.claims.role) || token.claims.forcePasswordChange === true) throw denied();
  return user;
}
function profile(value, accountUid) {
  if (!value) return null;
  if (value.id !== accountUid || value.active !== true || typeof value.displayName !== 'string' || !value.displayName.trim() || value.displayName.length > 160) throw denied();
  return { accountUid: value.id, displayName: value.displayName, active: true };
}
export const sqlPatientAccountService = {
  async get(accountUid) {
    await currentPatient(accountUid);
    const result = await getOwnSqlProfile(getDataConnect(firebaseApp, connectorConfig), { fetchPolicy: 'SERVER_ONLY' });
    if (auth.currentUser?.uid !== accountUid) throw denied();
    return profile(result.data.user, accountUid);
  },
  async initialize(accountUid, displayName, requestId) {
    await currentPatient(accountUid);
    if (typeof displayName !== 'string' || displayName.trim().length < 2 || displayName.length > 160 || [...displayName].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
      || typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new Error('Enter an account name between 2 and 160 characters.');
    const dc = getDataConnect(firebaseApp, connectorConfig);
    // Existing native operation binds auth.uid; no patient/link/contact is inferred.
    // Its older receipt rejects replay, so uncertain writes require explicit reload.
    await saveOwnSqlProfile(dc, { displayName: displayName.trim(), requestId });
    if (auth.currentUser?.uid !== accountUid) throw denied();
    const result = await getOwnSqlProfile(dc, { fetchPolicy: 'SERVER_ONLY' });
    if (auth.currentUser?.uid !== accountUid) throw denied();
    const account = profile(result.data.user, accountUid);
    if (!account) throw new Error('Account initialization could not be confirmed. Reload account status before continuing.');
    return account;
  },
};
