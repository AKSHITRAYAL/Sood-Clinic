import { EmailAuthProvider, reauthenticateWithCredential, sendPasswordResetEmail, signOut, updatePassword } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { hasStrongPassword, passwordPolicyMessage } from '../lib/passwordPolicy';

async function currentPatient(accountUid) {
  const user = auth.currentUser;
  if (!user || user.uid !== accountUid || !user.email) throw new Error('Sign in again with your patient account.');
  const { claims } = await user.getIdTokenResult(true);
  if (auth.currentUser?.uid !== accountUid || ['admin', 'doctor', 'manager'].includes(claims.role) || claims.forcePasswordChange === true) throw new Error('Sign in again with your patient account.');
  return user;
}
export const sqlPatientSecurityService = {
  async changePassword(accountUid, currentPassword, newPassword) {
    if (typeof currentPassword !== 'string' || !currentPassword || typeof newPassword !== 'string' || !hasStrongPassword(newPassword)) throw new Error(passwordPolicyMessage);
    const user = await currentPatient(accountUid);
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
    if (auth.currentUser?.uid !== accountUid) throw new Error('Your session changed. Sign in again before changing a password.');
    await updatePassword(user, newPassword);
    // Never sign out a different account if an Auth transition happened mid-request.
    if (auth.currentUser?.uid === accountUid) await signOut(auth);
    return { changed: true };
  },
  async sendReset(accountUid) {
    const user = await currentPatient(accountUid);
    if (auth.currentUser?.uid !== accountUid) throw new Error('Your session changed. Sign in again.');
    await sendPasswordResetEmail(auth, user.email);
    return { sent: true };
  },
};
