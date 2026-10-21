const { randomBytes, createHash } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { requireLiveStaff } = require('./staffAuthorization');
const { verifiedPatient, requireLivePatient } = require('./patientAuthorization');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uidValid = (value) => typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\s\x00-\x1f\x7f]/.test(value);
const unavailable = () => new HttpsError('unavailable', 'The linking change could not be confirmed. Ask the clinic to check access before retrying.');
const hash = (code) => createHash('sha256').update(code).digest('hex');

function input(data, fields) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some((key) => !fields.includes(key))) throw new HttpsError('invalid-argument', 'Provide valid linking details.');
  return data;
}
function pair(data) {
  if (typeof data.patientId !== 'string' || !uuidPattern.test(data.patientId) || !uidValid(data.targetUid)) throw new HttpsError('invalid-argument', 'Select the patient and account explicitly.');
}

// Pre-cutover service only: no callable exports or legacy patient-store writes.
// Issuing staff must verify identity/guardian authority in person, not by contact match.
function createPatientLinking({ auth, store, now = Date.now }) {
  async function staff(request) {
    return requireLiveStaff(auth, request, { roles: ['admin', 'manager'] });
  }
  return {
    async issue(request) {
      const actor = await staff(request);
      const data = input(request.data, ['patientId', 'targetUid', 'relationship', 'evidence']);
      pair(data);
      if (!((data.relationship === 'self' && data.evidence === 'in_person_identity') || (data.relationship === 'guardian' && data.evidence === 'guardian_authority'))) throw new HttpsError('invalid-argument', 'Clinic identity or guardian-authority verification is required.');
      let target;
      try { target = await auth.getUser(data.targetUid); } catch { throw new HttpsError('failed-precondition', 'Choose a current verified patient account.'); }
      if (!verifiedPatient(target)) throw new HttpsError('failed-precondition', 'Choose a current verified patient account.');
      const code = randomBytes(32).toString('base64url');
      const expiresAt = new Date(now() + 10 * 60 * 1000).toISOString();
      try { await store.issue({ ...data, tokenHash: hash(code), expiresAt, actorUid: actor.uid, actorRole: actor.customClaims.role }); }
      catch { throw unavailable(); }
      // Display once to the verifying clinic operator; never log or put in a URL.
      return { code, expiresAt };
    },
    async accept(request) {
      if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in to link a patient.');
      const { code } = input(request.data, ['code']);
      if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code)) throw new HttpsError('invalid-argument', 'Enter a valid clinic-issued code.');
      const user = await requireLivePatient(auth, request, now);
      const tokenHash = hash(code);
      let invitation;
      try { invitation = await store.find({ tokenHash, targetUid: user.uid }); } catch { throw unavailable(); }
      if (!invitation || invitation.targetUid !== user.uid) throw new HttpsError('permission-denied', 'This linking code is unavailable for your account.');
      try { await store.accept({ ...invitation, tokenHash }); }
      catch { throw new HttpsError('failed-precondition', 'This linking code is unavailable. Ask the clinic to check access.'); }
      return { linked: true };
    },
    async revoke(request) {
      const actor = await staff(request);
      const data = input(request.data, ['patientId', 'targetUid']);
      pair(data);
      try { await store.revoke({ ...data, actorUid: actor.uid, actorRole: actor.customClaims.role }); }
      catch { throw unavailable(); }
      return { revoked: true };
    },
  };
}

function sqlPatientLinkStore(dc) {
  const sdk = require('../generated/sql');
  const audited = (data) => ({ ...data, resourceId: `${data.patientId.toLowerCase()}/${data.targetUid}` });
  return {
    issue: (data) => sdk.issuePatientLinkInvitation(dc, audited(data)),
    async find(data) {
      const row = (await sdk.findPatientLinkInvitation(dc, data)).data.patientLinkInvitations[0];
      if (!row) return null;
      // SQL Connect returns UUID scalars without hyphens; keep audit IDs canonical.
      const patientId = row.patientId.replaceAll('-', '').toLowerCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
      if (!uuidPattern.test(patientId)) throw unavailable();
      return { patientId, targetUid: row.userId, relationship: row.relationship, verifiedBy: row.verifiedBy };
    },
    accept: (data) => sdk.acceptPatientLinkInvitation(dc, audited(data)),
    revoke: (data) => sdk.revokePatientLink(dc, audited(data)),
  };
}
module.exports = { createPatientLinking, sqlPatientLinkStore };
