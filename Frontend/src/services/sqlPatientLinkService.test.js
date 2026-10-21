import { beforeEach, expect, test, vi } from 'vitest';
const { invoke, names } = vi.hoisted(() => ({ invoke: vi.fn(), names: [] }));
vi.mock('firebase/functions', () => ({ httpsCallable: (_functions, name) => async payload => { names.push(name); return invoke(payload); } }));
vi.mock('../lib/firebase', () => ({ functions: {} }));
import { sqlPatientLinkService } from './sqlPatientLinkService';

const patientId = '50000000-0000-4000-8000-000000000001';
const uid = 'synthetic-account-uid';

beforeEach(() => { invoke.mockReset(); names.length = 0; });

test('issue requires an exact account pair and the matching evidence attestation', async () => {
  invoke.mockResolvedValue({ data: { code: 'C'.repeat(43), expiresAt: '2026-10-20T10:00:00Z', linkId: 'extra-private-field' } });
  await expect(sqlPatientLinkService.issue(patientId, uid, 'self', 'in_person_identity')).resolves.toEqual({ code: 'C'.repeat(43), expiresAt: '2026-10-20T10:00:00Z' });
  expect(names).toEqual(['issueSqlPatientLink']);
  expect(invoke).toHaveBeenCalledWith({ patientId, targetUid: uid, relationship: 'self', evidence: 'in_person_identity' });
  for (const args of [[patientId, uid, 'guardian', 'in_person_identity'], [patientId, uid, 'self', 'guardian_authority'], [patientId, uid, 'self', ''], ['not-a-uuid', uid, 'self', 'in_person_identity'], [patientId, 'with space', 'self', 'in_person_identity'], [patientId, '', 'self', 'in_person_identity'], [patientId, `${uid}\n`, 'self', 'in_person_identity']]) {
    await expect(sqlPatientLinkService.issue(...args)).rejects.toThrow();
  }
  expect(invoke).toHaveBeenCalledTimes(1);
  await sqlPatientLinkService.issue(patientId, uid, 'guardian', 'guardian_authority');
  expect(invoke).toHaveBeenLastCalledWith({ patientId, targetUid: uid, relationship: 'guardian', evidence: 'guardian_authority' });
});

test('issue never trusts a malformed or unconfirmed code response', async () => {
  for (const data of [{ code: 'short', expiresAt: '2026-10-20T10:00:00Z' }, { code: 'C'.repeat(43), expiresAt: 'not-a-date' }, { expiresAt: '2026-10-20T10:00:00Z' }, {}]) {
    invoke.mockResolvedValue({ data });
    await expect(sqlPatientLinkService.issue(patientId, uid, 'self', 'in_person_identity')).rejects.toThrow('Code issuance could not be confirmed. Do not reuse any older code.');
  }
});

test('revoke sends only the account pair and requires explicit confirmation', async () => {
  invoke.mockResolvedValue({ data: { revoked: true } });
  await expect(sqlPatientLinkService.revoke(patientId, uid)).resolves.toEqual({ revoked: true });
  expect(invoke).toHaveBeenCalledWith({ patientId, targetUid: uid });
  invoke.mockResolvedValue({ data: { revoked: false } });
  await expect(sqlPatientLinkService.revoke(patientId, uid)).rejects.toThrow('Revocation could not be confirmed. Ask the clinic to check access before retrying.');
  await expect(sqlPatientLinkService.revoke('not-a-uuid', uid)).rejects.toThrow('Select the patient and enter the exact account ID.');
  expect(names).toEqual(['revokeSqlPatientLink', 'revokeSqlPatientLink']);
});
