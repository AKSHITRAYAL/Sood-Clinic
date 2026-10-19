import { onIdTokenChanged } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../lib/firebase';

export function watchStaffSession(onChange) {
  let active = true; let generation = 0; let observed = false; let verifiedAt = 0; let checking = false;
  const check = async (user, force = false) => {
    if (!active) return;
    const version = ++generation;
    checking = true;
    onChange({ status: 'checking', user: undefined });
    if (!user) { checking = false; onChange({ status: 'signed-out', user: null }); return; }
    try {
      if (force) await user.getIdToken(true);
      if (!active || version !== generation) return;
      const { data } = await httpsCallable(functions, 'getStaffSession')();
      if (!['admin', 'doctor', 'manager'].includes(data?.role) || typeof data.mustChangePassword !== 'boolean'
        || (data.role === 'doctor' && (typeof data.doctorId !== 'string' || !/^[A-Za-z0-9_-]{2,80}$/.test(data.doctorId)))) throw new Error('Invalid session response.');
      if (!active || version !== generation) return;
      verifiedAt = Date.now();
      onChange({ status: 'allowed', user, role: data.role, doctorId: data.doctorId, mustChangePassword: data.mustChangePassword });
    } catch {
      if (active && version === generation) onChange({ status: 'error', user: null });
    } finally { if (version === generation) checking = false; }
  };
  const unsubscribe = onIdTokenChanged(auth, (user) => { observed = true; return check(user); }, () => {
    generation += 1; if (active) onChange({ status: 'error', user: null });
  });
  return {
    // Recheck on navigation/focus after one minute; no polling or background timer.
    refresh: (force = false) => { if (observed && (!checking || force) && (force || Date.now() - verifiedAt >= 60000)) return check(auth.currentUser, force); },
    unsubscribe: () => { active = false; generation += 1; unsubscribe(); },
  };
}

export const staffAccessState = (session, role, allowPasswordChange = false) => {
  if (session.status !== 'allowed') return session.status;
  if (session.mustChangePassword && !allowPasswordChange) return 'password-change';
  return !role || session.role === role ? 'allowed' : 'denied';
};
