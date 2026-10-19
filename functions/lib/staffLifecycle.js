const { randomUUID } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { isDoctorId, isEmail, isStaffRole, isStrongTemporaryPassword, normalizeEmail, staffClaims } = require('./staffAccess');
const { requireLiveAdmin, projectStaffIdentity } = require('./sqlStaffDirectory');

const actions = { provision: 'staff_provisioned', updateAccess: 'staff_access_updated', temporaryPassword: 'staff_temporary_password_set', disable: 'staff_suspended', revokeSessions: 'staff_sessions_revoked' };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unavailable = () => new HttpsError('unavailable', 'The staff change could not be confirmed. Refresh the directory and activity log before trying again.');

function createStaffLifecycle({ auth, store, now = Date.now }) {
  async function ownPasswordActor(request) {
    if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to change your password.');
    const user = await auth.getUser(request.auth.uid);
    const role = user.customClaims?.role;
    const authTime = request.auth.token?.auth_time;
    const cutoff = user.tokensValidAfterTime ? Date.parse(user.tokensValidAfterTime) / 1000 : 0;
    if (user.disabled || !isStaffRole(role) || role !== request.auth.token?.role || !Number.isFinite(authTime)
      || !Number.isFinite(cutoff) || authTime < Math.floor(cutoff) || authTime > now() / 1000 + 60 || now() / 1000 - authTime > 300) {
      throw new HttpsError('permission-denied', 'Sign in again before changing your password.');
    }
    if (user.customClaims.forcePasswordChange !== true) throw new HttpsError('failed-precondition', 'A mandatory password change is not pending.');
    return user;
  }

  async function change(actor, targetUid, action, requestId, apply) {
    const context = { actorUid: actor.uid, actorRole: actor.customClaims.role, targetUid, requestId: requestId || randomUUID() };
    if (!uuidPattern.test(context.requestId)) throw new HttpsError('invalid-argument', 'Choose a valid request identifier.');
    try { await store.begin({ ...context, action: `${action}_started` }); }
    catch { throw unavailable(); }
    let authStarted = false;
    try {
      const outcome = await apply(() => { authStarted = true; });
      const current = await auth.getUser(targetUid);
      await store.finish(projectStaffIdentity(current), { ...context, action });
      return outcome;
    } catch (error) {
      try {
        if (authStarted) {
          let current;
          try { current = await auth.getUser(targetUid); }
          catch (lookupError) { if (lookupError.code !== 'auth/user-not-found') throw lookupError; }
          if (current) await store.finish(projectStaffIdentity(current), { ...context, action: 'staff_change_incomplete' });
          else await store.abort(context);
        } else await store.abort(context);
      } catch {
        // Keep the durable lock after uncertain Auth/SQL completion; an operator must reconcile before releasing it.
        throw unavailable();
      }
      if (!authStarted && error instanceof HttpsError) throw error;
      throw unavailable();
    }
  }

  async function preventLockout(actorUid, target, nextRole, disabled) {
    if (target.customClaims?.role !== 'admin' || (nextRole === 'admin' && !disabled)) return;
    if (target.uid === actorUid) throw new HttpsError('failed-precondition', 'Use a different active administrator to change your own administrator access.');
    let pageToken; let count = 0; let pages = 0;
    do {
      const page = await auth.listUsers(1000, pageToken);
      count += page.users.filter((row) => !row.disabled && row.customClaims?.role === 'admin').length;
      pageToken = page.pageToken;
      if (++pages >= 10 && pageToken) throw new HttpsError('resource-exhausted', 'Administrator verification needs a larger scan window.');
    } while (pageToken);
    if (count <= 1) throw new HttpsError('failed-precondition', 'At least one active administrator must remain assigned.');
  }

  return {
    async manage(request) {
      const actor = await requireLiveAdmin(auth, request);
      const data = request.data;
      if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some((key) => !['action', 'email', 'password', 'displayName', 'role', 'doctorId', 'disabled', 'requestId'].includes(key))) throw new HttpsError('invalid-argument', 'Provide valid staff account details.');
      const { action, password, role, doctorId, disabled, requestId } = data;
      const email = normalizeEmail(data.email);
      const displayName = typeof data.displayName === 'string' ? data.displayName.trim() : '';
      if (!Object.hasOwn(actions, action) || !isEmail(email) || email.length > 254) throw new HttpsError('invalid-argument', 'Choose a valid action and staff email.');
      if (['provision', 'updateAccess'].includes(action) && (!isStaffRole(role) || displayName.length < 2 || displayName.length > 160 || /[\r\n]/.test(displayName) || (role === 'doctor' && !isDoctorId(doctorId)))) throw new HttpsError('invalid-argument', 'Enter a name, valid role and doctor identifier when required.');
      if (['provision', 'temporaryPassword'].includes(action) && (typeof password !== 'string' || !isStrongTemporaryPassword(password))) throw new HttpsError('invalid-argument', 'Use at least 8 characters, uppercase and lowercase letters, a number and a special character.');
      if (action === 'disable' && typeof disabled !== 'boolean') throw new HttpsError('invalid-argument', 'Choose whether to suspend or restore the account.');
      let target;
      try { target = await auth.getUserByEmail(email); }
      catch (error) { if (error.code !== 'auth/user-not-found') throw unavailable(); }
      if (action === 'provision' && target) throw new HttpsError('already-exists', 'This email already belongs to an account. Manage its existing access instead.');
      if (action !== 'provision' && (!target || !isStaffRole(target.customClaims?.role))) throw new HttpsError('failed-precondition', 'This account is not a managed staff account.');
      const targetUid = target?.uid || randomUUID();
      const auditAction = action === 'disable' && !disabled ? 'staff_restored' : actions[action];
      return change(actor, targetUid, auditAction, requestId, async (markStarted) => {
        // Re-check authority after acquiring the shared SQL lock, before touching Auth.
        await requireLiveAdmin(auth, request);
        if (target) {
          target = await auth.getUser(target.uid);
          if (!isStaffRole(target.customClaims?.role)) throw new HttpsError('failed-precondition', 'This account is no longer managed staff.');
        }
        if (action === 'provision') {
          markStarted();
          await auth.createUser({ uid: targetUid, email, displayName, password, disabled: true });
          await auth.setCustomUserClaims(targetUid, staffClaims({ role, doctorId, forcePasswordChange: true }));
          await auth.revokeRefreshTokens(targetUid);
          await auth.updateUser(targetUid, { disabled: false });
          return { uid: targetUid, message: 'Staff account created. The temporary password must be changed at first sign-in.' };
        }
        if (action === 'updateAccess') {
          await preventLockout(actor.uid, target, role, target.disabled);
          markStarted();
          await auth.updateUser(targetUid, { displayName });
          await auth.setCustomUserClaims(targetUid, staffClaims({ existingClaims: target.customClaims, role, doctorId, forcePasswordChange: target.customClaims.forcePasswordChange === true }));
        } else if (action === 'temporaryPassword') {
          if (targetUid === actor.uid) throw new HttpsError('failed-precondition', 'Use My account to change your own password.');
          markStarted();
          await auth.setCustomUserClaims(targetUid, { ...target.customClaims, forcePasswordChange: true });
          await auth.updateUser(targetUid, { password });
        } else if (action === 'disable') {
          await preventLockout(actor.uid, target, target.customClaims.role, disabled);
          markStarted();
          await auth.updateUser(targetUid, { disabled });
        } else {
          if (targetUid === actor.uid) throw new HttpsError('failed-precondition', 'Use sign out for your own session.');
          markStarted();
        }
        await auth.revokeRefreshTokens(targetUid);
        return { message: action === 'disable' ? (disabled ? 'Staff account suspended and sessions revoked.' : 'Staff account restored.') : action === 'temporaryPassword' ? 'Temporary password set. A new password is required at the next sign-in.' : 'Staff access updated and refresh sessions revoked.' };
      });
    },

    async completePassword(request) {
      const actor = await ownPasswordActor(request);
      const data = request.data;
      if (!data || typeof data.newPassword !== 'string' || !isStrongTemporaryPassword(data.newPassword) || Object.keys(data).some((key) => !['newPassword', 'requestId'].includes(key))) throw new HttpsError('invalid-argument', 'Enter a new password meeting all password conditions.');
      return change(actor, actor.uid, 'staff_password_changed', data.requestId, async (markStarted) => {
        const current = await ownPasswordActor(request);
        markStarted();
        await auth.updateUser(actor.uid, { password: data.newPassword });
        await auth.revokeRefreshTokens(actor.uid);
        await auth.setCustomUserClaims(actor.uid, { ...current.customClaims, forcePasswordChange: false });
        return { ok: true, signInRequired: true };
      });
    },
  };
}

function sqlStaffLifecycleStore(dc) {
  const { beginStaffAccessChange, finishStaffAccessChange, abortStaffAccessChange } = require('../generated/sql');
  return {
    begin: async (context) => { await beginStaffAccessChange(dc, context); },
    finish: async (row, context) => {
      const { targetUid, ...audit } = context;
      if (targetUid !== row.uid) throw new Error('Staff change target mismatch.');
      await finishStaffAccessChange(dc, { ...row, ...audit });
    },
    abort: async (context) => { await abortStaffAccessChange(dc, context); },
  };
}

module.exports = { createStaffLifecycle, sqlStaffLifecycleStore };
