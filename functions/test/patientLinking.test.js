import { createRequire } from 'node:module';
import { expect, test, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { createPatientLinking } = require('../lib/patientLinking');
const patientId = '20000000-0000-4000-8000-000000000001';
const patient = { uid: 'patient-account', emailVerified: true, disabled: false, customClaims: {}, tokensValidAfterTime: '1970-01-01T00:00:00Z' };
const manager = { ...patient, uid: 'manager', customClaims: { role: 'manager' } };
const request = (uid, role, data) => ({ auth: { uid, token: { role, email_verified: true, auth_time: 100 } }, data });
const issueData = { patientId, targetUid: patient.uid, relationship: 'self', evidence: 'in_person_identity' };
function setup() {
  const users = { manager, [patient.uid]: patient };
  const auth = { getUser: vi.fn(async (uid) => users[uid]) };
  const store = { issue: vi.fn(), find: vi.fn(), accept: vi.fn(), revoke: vi.fn() };
  return { users, auth, store, service: createPatientLinking({ auth, store, now: () => 100000 }) };
}
test('clinic-issued code is random, hashed at rest and bound to explicit patient/account evidence', async () => {
  const { service, store } = setup();
  const result = await service.issue(request('manager', 'manager', issueData));
  expect(result.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(result.expiresAt).toBe(new Date(700000).toISOString());
  expect(store.issue).toHaveBeenCalledWith(expect.objectContaining({ patientId, targetUid: patient.uid, relationship: 'self', evidence: 'in_person_identity', actorUid: 'manager', actorRole: 'manager', tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) }));
  expect(JSON.stringify(store.issue.mock.calls)).not.toContain(result.code);
  expect((await service.issue(request('manager', 'manager', issueData))).code).not.toBe(result.code);
});
test('issuance rejects unverified/disabled/staff targets, stale staff and unsupported evidence without writes', async () => {
  const { service, store, users } = setup();
  for (const change of [{ emailVerified: false }, { disabled: true }, { customClaims: { role: 'doctor' } }]) {
    users[patient.uid] = { ...patient, ...change };
    await expect(service.issue(request('manager', 'manager', issueData))).rejects.toMatchObject({ code: 'failed-precondition' });
  }
  users[patient.uid] = patient;
  for (const data of [{ ...issueData, evidence: 'email_match' }, { ...issueData, relationship: 'guardian' }, { ...issueData, phone: '1234567890' }, { ...issueData, targetUid: '' }]) {
    await expect(service.issue(request('manager', 'manager', data))).rejects.toMatchObject({ code: 'invalid-argument' });
  }
  users.manager = { ...manager, customClaims: { role: 'doctor' } };
  await expect(service.issue(request('manager', 'manager', issueData))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(store.issue).not.toHaveBeenCalled();
});
test('redemption binds to current verified nonstaff Auth and returns no patient details', async () => {
  const { service, store } = setup();
  const issued = await service.issue(request('manager', 'manager', issueData));
  const invitation = { patientId, targetUid: patient.uid, relationship: 'self', verifiedBy: 'manager' };
  store.find.mockResolvedValue(invitation);
  await expect(service.accept(request(patient.uid, undefined, { code: issued.code }))).resolves.toEqual({ linked: true });
  expect(store.accept).toHaveBeenCalledWith(expect.objectContaining({ ...invitation, tokenHash: store.issue.mock.calls[0][0].tokenHash }));
  store.find.mockResolvedValue({ ...invitation, targetUid: 'someone-else' });
  await expect(service.accept(request(patient.uid, undefined, { code: issued.code }))).rejects.toMatchObject({ code: 'permission-denied' });
});
test('invalid, missing, revoked and changed-role sessions fail closed before code lookup', async () => {
  const { service, store, users } = setup();
  for (const req of [{ data: { code: 'a'.repeat(43) } }, request(patient.uid, undefined, { code: 'bad' }), request(patient.uid, 'admin', { code: 'a'.repeat(43) })]) {
    await expect(service.accept(req)).rejects.toBeDefined();
  }
  for (const change of [{ emailVerified: false }, { disabled: true }, { customClaims: { role: 'manager' } }, { tokensValidAfterTime: '1970-01-01T00:01:41Z' }]) {
    users[patient.uid] = { ...patient, ...change };
    await expect(service.accept(request(patient.uid, undefined, { code: 'a'.repeat(43) }))).rejects.toMatchObject({ code: 'permission-denied' });
  }
  expect(store.find).not.toHaveBeenCalled();
  expect(store.accept).not.toHaveBeenCalled();
});
test('revocation is staff-only, removes pending codes as well as links, SQL errors stay generic', async () => {
  const { service, store } = setup();
  const data = { patientId, targetUid: patient.uid };
  await expect(service.revoke(request('manager', 'manager', data))).resolves.toEqual({ revoked: true });
  expect(store.revoke).toHaveBeenCalledWith(expect.objectContaining({ ...data, actorUid: 'manager', actorRole: 'manager' }));
  await expect(service.revoke(request(patient.uid, undefined, data))).rejects.toMatchObject({ code: 'permission-denied' });
  store.issue.mockRejectedValue(new Error('private database information'));
  await expect(service.issue(request('manager', 'manager', issueData))).rejects.toMatchObject({ code: 'unavailable' });
});
