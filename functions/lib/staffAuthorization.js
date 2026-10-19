const { HttpsError } = require('firebase-functions/v2/https');
const { isDoctorId, isStaffRole } = require('./staffAccess');

async function requireLiveStaff(auth, request, { roles = ['admin', 'doctor', 'manager'], doctorId, allowForcedPassword = false } = {}) {
  const token = request.auth?.token;
  if (!request.auth?.uid || !isStaffRole(token?.role) || !roles.includes(token.role)) throw new HttpsError('permission-denied', 'Current staff access is required.');
  let user;
  try { user = await auth.getUser(request.auth.uid); }
  catch { throw new HttpsError('permission-denied', 'Sign in again to verify staff access.'); }
  const claims = user.customClaims || {};
  const cutoff = user.tokensValidAfterTime ? Math.floor(Date.parse(user.tokensValidAfterTime) / 1000) : 0;
  if (user.disabled || claims.role !== token.role || !Number.isFinite(token.auth_time) || !Number.isFinite(cutoff) || token.auth_time < cutoff
    || (!allowForcedPassword && (claims.forcePasswordChange === true || token.forcePasswordChange === true))) {
    throw new HttpsError('permission-denied', 'Sign in again to verify staff access.');
  }
  if (claims.role === 'doctor' && (typeof claims.doctorId !== 'string' || !isDoctorId(claims.doctorId) || token.doctorId !== claims.doctorId || (doctorId !== undefined && doctorId !== claims.doctorId))) {
    throw new HttpsError('permission-denied', 'Current doctor access is required for this record.');
  }
  return user;
}

const requireLiveAdmin = (auth, request) => requireLiveStaff(auth, request, { roles: ['admin'] });

async function requireOAuthAdministrator(auth, uid, issuedAt) {
  const user = await auth.getUser(uid);
  const cutoff = user.tokensValidAfterTime ? Date.parse(user.tokensValidAfterTime) : 0;
  if (user.disabled || user.customClaims?.role !== 'admin' || user.customClaims.forcePasswordChange === true
    || !Number.isFinite(issuedAt) || !Number.isFinite(cutoff) || issuedAt < cutoff) {
    throw new HttpsError('permission-denied', 'The administrator connection request is no longer valid.');
  }
  return user;
}
module.exports = { requireLiveStaff, requireLiveAdmin, requireOAuthAdministrator };
