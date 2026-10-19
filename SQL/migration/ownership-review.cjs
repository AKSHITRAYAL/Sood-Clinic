const uidValid = value => typeof value === 'string' && value.length > 0 && value.length <= 128 && !/[\s\x00-\x1f\x7f/]/.test(value);
const reject = code => { throw Object.assign(new Error(code), { migrationCode: code }); };

function sourceClaims(record) {
  const claims = new Map(); const data = record.data;
  const add = (uid, source) => {
    if (!uidValid(uid)) reject('INVALID_OWNERSHIP_METADATA');
    if (!claims.has(uid)) claims.set(uid, new Set());
    claims.get(uid).add(source);
  };
  if (data.uid !== undefined && data.uid !== null) add(data.uid, 'uid');
  if (data.linkedUids !== undefined) {
    if (!Array.isArray(data.linkedUids) || data.linkedUids.length > 1000 || new Set(data.linkedUids).size !== data.linkedUids.length) reject('INVALID_OWNERSHIP_METADATA');
    for (const uid of data.linkedUids) add(uid, 'linkedUids');
  }
  // Legacy portal/rules use this path; retaining the claim is not verifying it.
  if (data.recordSource !== 'staff') add(record.path.split('/')[1], 'legacy_document_path');
  return claims;
}

function assessPatientOwnership(record, records, options = {}) {
  const { inspectRecord, mapPatientRecord } = require('./rehearsal.cjs');
  try {
    if (!Array.isArray(records) || records.length > 10000) reject('INVALID_BATCH');
    const mapped = mapPatientRecord(record, records, options.patientTargetSnapshot);
    if (mapped.status !== 'mapped') return mapped;
    const accounts = new Map(); const patientClaims = new Map(); const claimantCounts = new Map();
    for (const source of records) {
      if (source.source === 'auth') {
        const data = source.data;
        if (inspectRecord(source).status === 'rejected' || !uidValid(data.uid) || source.path !== data.uid || typeof data.disabled !== 'boolean' || typeof data.emailVerified !== 'boolean' || (data.customClaims !== undefined && (!data.customClaims || Object.getPrototypeOf(data.customClaims) !== Object.prototype)) || (data.customClaims?.role !== undefined && typeof data.customClaims.role !== 'string') || (data.customClaims?.forcePasswordChange !== undefined && typeof data.customClaims.forcePasswordChange !== 'boolean')) reject('INVALID_AUTH_SNAPSHOT');
        if (accounts.has(data.uid)) reject('DUPLICATE_AUTH_IDENTITY');
        accounts.set(data.uid, data);
      }
      if (source.source === 'firestore' && /^patients\/[^/]+$/.test(source.path)) {
        if (inspectRecord(source).status === 'rejected') reject('INVALID_OWNERSHIP_METADATA');
        if (patientClaims.has(source.path)) reject('DUPLICATE_SOURCE');
        const claims = sourceClaims(source);
        patientClaims.set(source.path, claims);
        for (const uid of claims.keys()) claimantCounts.set(uid, (claimantCounts.get(uid) || 0) + 1);
      }
    }
    const blockers = new Set(['PATIENT_OWNERSHIP_REVIEW', 'CLINIC_LINK_VERIFICATION_REQUIRED', 'AUTH_CENSUS_COMPLETENESS_PENDING', 'AUTH_LIVE_REVALIDATION_PENDING']);
    const claims = [];
    for (const [uid, sources] of patientClaims.get(record.path)) {
      const reasons = new Set(['CLINIC_LINK_VERIFICATION_REQUIRED']);
      const account = accounts.get(uid);
      if (!account) reasons.add('ACCOUNT_NOT_IN_SNAPSHOT');
      else {
        if (account.disabled) reasons.add('ACCOUNT_DISABLED');
        if (!account.emailVerified) reasons.add('ACCOUNT_EMAIL_UNVERIFIED');
        if (account.customClaims?.forcePasswordChange === true) reasons.add('ACCOUNT_PASSWORD_CHANGE_REQUIRED');
        const role = account.customClaims?.role;
        if (['admin', 'manager', 'doctor', 'receptionist'].includes(role)) reasons.add('ACCOUNT_STAFF_EXCLUDED');
        else if (role !== undefined) reasons.add('ACCOUNT_ROLE_REVIEW');
      }
      if (claimantCounts.get(uid) > 1) reasons.add('ACCOUNT_MULTI_PATIENT_CLAIM_REVIEW');
      for (const reason of reasons) blockers.add(reason);
      claims.push({ uid, sources: [...sources].sort(), decision: 'review_required', blockers: [...reasons].sort() });
    }
    if (claims.length > 1) blockers.add('MULTIPLE_ACCOUNT_CLAIMS_REVIEW');
    if (!claims.length) blockers.add('UNLINKED_PATIENT_PRESERVED');
    for (const reason of mapped.blockers) blockers.add(reason);
    if (!mapped.targetSnapshotChecked) blockers.add('PATIENT_TARGET_IDENTITY_PENDING');
    return { status: 'assessed', readyForApply: false, grants: 0, patientId: mapped.rows.patient.id, claims: claims.sort((a, b) => a.uid.localeCompare(b.uid)), blockers: [...blockers].sort(), source: structuredClone(record) };
  } catch (error) { return { status: 'rejected', reason: error.migrationCode || 'INVALID_OWNERSHIP_RECORD' }; }
}
module.exports = { assessPatientOwnership };
