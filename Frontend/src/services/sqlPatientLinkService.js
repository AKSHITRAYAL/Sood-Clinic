import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function pair(patientId, targetUid) {
  if (typeof patientId !== 'string' || !uuid.test(patientId) || typeof targetUid !== 'string' || !targetUid || targetUid.length > 128 || /\s/.test(targetUid) || [...targetUid].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new Error('Select the patient and enter the exact account ID.');
  return { patientId, targetUid };
}
export const sqlPatientLinkService = {
  async issue(patientId, targetUid, relationship, evidence) {
    const data = pair(patientId, targetUid);
    if (!((relationship === 'self' && evidence === 'in_person_identity') || (relationship === 'guardian' && evidence === 'guardian_authority'))) throw new Error('Clinic identity or guardian-authority verification is required.');
    const result = (await httpsCallable(functions, 'issueSqlPatientLink')({ ...data, relationship, evidence })).data;
    if (typeof result?.code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(result.code) || typeof result.expiresAt !== 'string' || !Number.isFinite(Date.parse(result.expiresAt))) throw new Error('Code issuance could not be confirmed. Do not reuse any older code.');
    return { code: result.code, expiresAt: result.expiresAt };
  },
  async revoke(patientId, targetUid) {
    const result = (await httpsCallable(functions, 'revokeSqlPatientLink')(pair(patientId, targetUid))).data;
    if (result?.revoked !== true) throw new Error('Revocation could not be confirmed. Ask the clinic to check access before retrying.');
    return { revoked: true };
  },
};
