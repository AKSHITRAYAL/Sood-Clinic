import { EmailAuthProvider, reauthenticateWithCredential, signOut, updatePassword } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../lib/firebase';

export async function changeStaffPassword(user, currentPassword, newPassword, mandatory) {
  if (currentPassword === newPassword) throw new Error('Choose a password different from your current password.');
  let authenticated = false;
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
    authenticated = true;
    if (mandatory) {
      await user.getIdToken(true);
      await httpsCallable(functions, 'completeOwnPasswordChange')({ newPassword, requestId: crypto.randomUUID() });
      await signOut(auth);
    } else await updatePassword(user, newPassword);
  } catch {
    throw new Error(authenticated
      ? 'The password change could not be confirmed. Try signing in with your new password before retrying.'
      : 'Check your current password and try again.');
  }
}
