const { HttpsError } = require('firebase-functions/v2/https');
const { isStaffRole } = require('./staffAccess');

const verifiedPatient = user => user && !user.disabled && user.emailVerified === true && !isStaffRole(user.customClaims?.role) && user.customClaims?.forcePasswordChange !== true;

async function requireLivePatient(auth, request, now = Date.now) {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to access your patient profile.');
  let user;
  try { user = await auth.getUser(request.auth.uid); }
  catch { throw new HttpsError('permission-denied', 'Sign in again with a verified patient account.'); }
  const token = request.auth.token || {};
  const cutoff = user?.tokensValidAfterTime ? Math.floor(Date.parse(user.tokensValidAfterTime) / 1000) : 0;
  if (!verifiedPatient(user) || user.uid !== request.auth.uid || token.email_verified !== true || isStaffRole(token.role)
    || token.forcePasswordChange === true || !Number.isFinite(token.auth_time) || !Number.isFinite(cutoff)
    || token.auth_time < cutoff || token.auth_time > now() / 1000 + 60) {
    throw new HttpsError('permission-denied', 'Sign in again with a verified patient account.');
  }
  return user;
}
module.exports = { verifiedPatient, requireLivePatient };
