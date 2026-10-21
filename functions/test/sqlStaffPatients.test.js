import { createRequire } from 'node:module';
import { expect, test, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { createSqlPatientProfiles } = require('../lib/sqlPatientProfiles');
const patientId = '50000000-0000-4000-8000-000000000001';
const otherPatientId = '50000000-0000-4000-8000-000000000002';
const requestId = '60000000-0000-4000-8000-000000000001';
const updatedAt = '2026-10-20T00:00:00.123456Z';
const phone = '+919876543210';
const profile = { displayName: 'Synthetic Patient', phone, dateOfBirth: '2000-02-29', addressLine1: 'Synthetic address' };
const demographicKeys = ['patientId', 'uhid', 'updatedAt', 'displayName', 'phone', 'title', 'dateOfBirth', 'gender', 'maritalStatus', 'addressLine1', 'city', 'state', 'postalCode', 'emergencyContactName', 'emergencyContactPhone'];

function staffRow(patch = {}) {
  return {
    id: patientId, uhid: 'TEST-ONLY', displayName: 'Synthetic Patient', phone, archivedAt: null, updatedAt,
    email: 'private@example.test', legacyCreatedByUid: 'private-actor', bloodGroup: 'AB+', healthNotes: 'private-health', relationship: 'self',
    ...patch,
  };
}

function setup({ role = 'admin' } = {}) {
  const user = { uid: 'staff-actor', disabled: false, customClaims: { role }, tokensValidAfterTime: null };
  const auth = { getUser: vi.fn(async () => user) };
  const store = {
    searchStaff: vi.fn(async () => [staffRow({ uhid: 'TEST-ONLY' })]),
    readStaff: vi.fn(async () => staffRow()),
    saveStaff: vi.fn(),
    receipt: vi.fn(async () => null),
    list: vi.fn(async () => []),
    read: vi.fn(async () => null),
    save: vi.fn(),
  };
  const service = createSqlPatientProfiles({ auth, store, now: () => Date.parse(updatedAt) });
  const request = (data) => ({ auth: { uid: user.uid, token: { role, auth_time: 100 } }, data });
  return { user, auth, store, service, request };
}

test('staff registry accepts only an exact UHID or one canonical phone key and passes live-Auth actor scope', async () => {
  const { store, service, request } = setup();
  store.searchStaff.mockResolvedValue([staffRow({ uhid: 'SC-000001' })]);
  await expect(service.searchStaff(request({ uhid: '  SC-000001  ' }))).resolves.toMatchObject({ patients: [{ patientId, uhid: 'SC-000001' }] });
  expect(store.searchStaff).toHaveBeenLastCalledWith({ actorUid: 'staff-actor', actorRole: 'admin', kind: 'uhid', value: 'SC-000001' });
  store.searchStaff.mockResolvedValue([staffRow({ phone })]);
  await expect(service.searchStaff(request({ phone: '9876543210' }))).resolves.toMatchObject({ patients: [{ patientId }] });
  expect(store.searchStaff).toHaveBeenLastCalledWith({ actorUid: 'staff-actor', actorRole: 'admin', kind: 'phone', value: phone });
  for (const data of [{}, { uhid: '' }, { uhid: '   ' }, { uhid: 'SC-*' }, { uhid: '%LIKE%' }, { uhid: 'a'.repeat(65) }, { uhid: 'SC-1', phone }, { phone, name: 'Synthetic' }, { name: 'Synthetic' }, { email: 'private@example.test' }, { phone: 'not-a-phone' }, { phone: '' }]) {
    await expect(service.searchStaff(request(data))).rejects.toMatchObject({ code: 'invalid-argument' });
  }
  expect(store.searchStaff).toHaveBeenCalledTimes(2);
});

test('registry results expose only UUID/UHID/name/phone; clinical, email, Auth, link and provenance fields stay private', async () => {
  const { store, service, request } = setup();
  store.searchStaff.mockResolvedValue([staffRow({ legacyCreatedByRole: 'manager', blood_group: 'O+' })]);
  const result = await service.searchStaff(request({ uhid: 'TEST-ONLY' }));
  expect(result.patients).toHaveLength(1);
  expect(Object.keys(result.patients[0]).sort()).toEqual(['displayName', 'patientId', 'phone', 'uhid']);
  for (const field of ['email', 'healthNotes', 'bloodGroup', 'blood_group', 'relationship', 'legacyCreatedByUid', 'legacyCreatedByRole', 'archivedAt', 'updatedAt']) {
    expect(result.patients[0]).not.toHaveProperty(field);
  }
  expect(JSON.stringify(result)).not.toContain('private-health');
  expect(JSON.stringify(result)).not.toContain('private@example.test');
});

test('staff search fails closed on archived, mismatched, duplicate, multi-UHID and oversized results', async () => {
  const oversized = Array(21).fill(null).map((_, index) => staffRow({ id: index === 0 ? patientId : `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` }));
  for (const rows of [
    [staffRow({ archivedAt: updatedAt })],
    [staffRow({ phone: '+919000000000' })],
    [staffRow(), staffRow()],
    [staffRow({ displayName: '   ' })],
    oversized,
  ]) {
    const { store, service, request } = setup();
    store.searchStaff.mockResolvedValue(rows);
    await expect(service.searchStaff(request({ phone }))).rejects.toMatchObject({ code: 'failed-precondition' });
    expect(store.searchStaff).toHaveBeenCalledWith(expect.objectContaining({ kind: 'phone', value: phone }));
  }
  const multiUhid = setup();
  multiUhid.store.searchStaff.mockResolvedValue([staffRow(), staffRow({ id: otherPatientId })]);
  await expect(multiUhid.service.searchStaff(multiUhid.request({ uhid: 'TEST-ONLY' }))).rejects.toMatchObject({ code: 'failed-precondition' });

  const bounded = setup();
  bounded.store.searchStaff.mockResolvedValue(Array(20).fill(null).map((_, index) => staffRow({ id: index === 0 ? patientId : `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` })));
  await expect(bounded.service.searchStaff(bounded.request({ phone }))).resolves.toMatchObject({ patients: expect.any(Array) });
  expect(bounded.store.searchStaff.mock.results).toHaveLength(1);
});

test('only current live admin and manager sessions reach the registry; every other caller fails before SQL', async () => {
  const forbidden = [
    { label: 'anonymous' },
    { label: 'patient', role: 'patient' },
    { label: 'doctor', role: 'doctor' },
    { label: 'disabled', role: 'manager', disabled: true },
    { label: 'demoted', role: 'manager', claimsRole: 'doctor' },
    { label: 'forced-claim', role: 'admin', forceClaim: true },
    { label: 'forced-token', role: 'admin', forceToken: true },
    { label: 'revoked', role: 'manager', revoked: true },
  ];
  for (const patch of forbidden) {
    const { user, store, service, request } = setup({ role: patch.role ?? 'admin' });
    user.customClaims = { role: patch.claimsRole ?? patch.role ?? 'admin', ...(patch.forceClaim ? { forcePasswordChange: true } : {}) };
    if (patch.disabled) user.disabled = true;
    if (patch.revoked) user.tokensValidAfterTime = '2026-10-21T00:00:00Z';
    const req = request({ uhid: 'TEST-ONLY' });
    if (patch.forceToken) req.auth.token.forcePasswordChange = true;
    if (patch.label === 'anonymous') delete req.auth;
    await expect(service.searchStaff(req)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(service.getStaff(req)).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(service.saveStaff(req)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(store.searchStaff).not.toHaveBeenCalled();
    expect(store.readStaff).not.toHaveBeenCalled();
    expect(store.saveStaff).not.toHaveBeenCalled();
  }
  for (const role of ['admin', 'manager']) {
    const { store, service, request } = setup({ role });
    await service.searchStaff(request({ uhid: 'TEST-ONLY' }));
    expect(store.searchStaff).toHaveBeenCalledWith(expect.objectContaining({ actorRole: role }));
  }
});

test('getStaff returns the demographic allow-list only and fails closed for missing, archived or mismatched records', async () => {
  const { store, service, request } = setup();
  const result = await service.getStaff(request({ patientId }));
  expect(Object.keys(result.profile).sort()).toEqual([...demographicKeys].sort());
  expect(result.profile).not.toHaveProperty('relationship');
  for (const field of ['email', 'healthNotes', 'bloodGroup', 'legacyCreatedByUid', 'archivedAt']) expect(result.profile).not.toHaveProperty(field);
  expect(store.readStaff).toHaveBeenCalledWith({ actorUid: 'staff-actor', patientId, actorRole: 'admin' });
  for (const row of [null, staffRow({ archivedAt: updatedAt }), staffRow({ id: otherPatientId })]) {
    const fixture = setup();
    fixture.store.readStaff.mockResolvedValue(row);
    await expect(fixture.service.getStaff(fixture.request({ patientId }))).rejects.toMatchObject({ code: 'not-found' });
    expect(fixture.store.readStaff).toHaveBeenCalledWith({ actorUid: 'staff-actor', patientId, actorRole: 'admin' });
  }
  const failing = setup();
  failing.store.readStaff.mockRejectedValue(Error('private SQL detail'));
  await expect(failing.service.getStaff(failing.request({ patientId }))).rejects.toMatchObject({ code: 'unavailable', message: expect.not.stringContaining('private') });
});

test('saveStaff takes the actor role from live Auth, excludes health/UHID/Auth fields and guards the shared revision', async () => {
  const { store, service, request } = setup({ role: 'manager' });
  await expect(service.saveStaff(request({ patientId, requestId, expectedUpdatedAt: updatedAt, profile }))).resolves.toEqual({ saved: true });
  const commit = store.saveStaff.mock.calls[0][0];
  expect(commit).toMatchObject({ actorUid: 'staff-actor', actorRole: 'manager', patientId, requestId, expectedUpdatedAt: updatedAt, displayName: profile.displayName, phone: profile.phone });
  expect(commit.operation.startsWith('staff_patient_demographics:')).toBe(true);
  for (const field of ['bloodGroup', 'healthNotes', 'email', 'uhid', 'legacyCreatedByUid', 'relationship']) expect(commit).not.toHaveProperty(field);
  expect(store.readStaff).toHaveBeenCalledWith({ actorUid: 'staff-actor', patientId, actorRole: 'manager' });

  const spoof = setup();
  await expect(spoof.service.saveStaff(spoof.request({ patientId, requestId, expectedUpdatedAt: updatedAt, profile, actorRole: 'admin', actorUid: 'someone-else' }))).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(spoof.store.saveStaff).not.toHaveBeenCalled();

  const mismatch = setup({ role: 'manager' });
  mismatch.user.customClaims = { role: 'admin' };
  await expect(mismatch.service.saveStaff(mismatch.request({ patientId, requestId, expectedUpdatedAt: updatedAt, profile }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(mismatch.store.saveStaff).not.toHaveBeenCalled();

  const stale = setup();
  stale.store.readStaff.mockResolvedValue(staffRow({ updatedAt: '2026-10-20T00:00:00.123457Z' }));
  await expect(stale.service.saveStaff(stale.request({ patientId, requestId, expectedUpdatedAt: updatedAt, profile }))).rejects.toMatchObject({ code: 'aborted' });
  expect(stale.store.saveStaff).not.toHaveBeenCalled();
});

test('reused request IDs never cross into different payloads or operation types; unknown outcomes stay uncertain', async () => {
  const { store, service, request } = setup();
  store.saveStaff.mockImplementation(async (data) => { store.receipt.mockResolvedValue(data.operation); throw Error('Synthetic lost acknowledgement'); });
  await expect(service.saveStaff(request({ patientId, requestId, expectedUpdatedAt: updatedAt, profile }))).resolves.toEqual({ saved: true });
  await expect(service.saveStaff(request({ patientId, requestId, expectedUpdatedAt: updatedAt, profile }))).resolves.toEqual({ saved: true });
  await expect(service.saveStaff(request({ patientId, requestId, expectedUpdatedAt: updatedAt, profile: { ...profile, city: 'Changed' } }))).rejects.toMatchObject({ code: 'already-exists' });
  store.receipt.mockResolvedValue('patient_demographics:other-operation');
  await expect(service.saveStaff(request({ patientId, requestId, expectedUpdatedAt: updatedAt, profile }))).rejects.toMatchObject({ code: 'already-exists' });

  const unknown = setup();
  unknown.store.saveStaff.mockRejectedValue(Error('Synthetic unknown outcome'));
  await expect(unknown.service.saveStaff(unknown.request({ patientId, requestId, expectedUpdatedAt: updatedAt, profile }))).rejects.toMatchObject({ code: 'unavailable' });
  expect(unknown.store.saveStaff).toHaveBeenCalledTimes(1);
  expect(await unknown.store.receipt({ actorUid: 'staff-actor', requestId })).toBe(null);
});

test('a late audit failure inside the transactional search returns no data and no raw SQL details', async () => {
  const { store, service, request } = setup();
  store.searchStaff.mockRejectedValue(Error('private-name private-phone SQL credentials'));
  await expect(service.searchStaff(request({ uhid: 'TEST-ONLY' }))).rejects.toMatchObject({ code: 'unavailable', message: expect.not.stringContaining('private-name') });
  await expect(service.searchStaff(request({ uhid: 'TEST-ONLY' }))).rejects.not.toThrow('private-phone');
});

test('patient get/save contracts are unchanged by the shared projection and operation namespaces never mix', async () => {
  const patientUser = { uid: 'patient-account', emailVerified: true, disabled: false, customClaims: {} };
  const patientRow = { relationship: 'self', verifiedBy: 'clinic-manager', verifiedAt: updatedAt, patient: { id: patientId.replaceAll('-', ''), uhid: 'TEST-ONLY', ...profile, email: 'private@example.test', archivedAt: null, updatedAt, legacyCreatedByUid: 'private-actor', healthNotes: 'private-health' } };
  const auth = { getUser: vi.fn(async () => patientUser) };
  const store = { read: vi.fn(async () => patientRow), receipt: vi.fn(async () => null), save: vi.fn(), searchStaff: vi.fn(), readStaff: vi.fn(), saveStaff: vi.fn() };
  const service = createSqlPatientProfiles({ auth, store, now: () => Date.parse(updatedAt) });
  const patientRequest = (data) => ({ auth: { uid: patientUser.uid, token: { email_verified: true, auth_time: 100 } }, data });
  const patient = await service.get(patientRequest({ patientId }));
  expect(Object.keys(patient.profile).sort()).toEqual([...demographicKeys, 'relationship'].sort());
  await expect(service.save(patientRequest({ patientId, requestId, expectedUpdatedAt: updatedAt, profile }))).resolves.toEqual({ saved: true });
  expect(store.save.mock.calls[0][0].operation.startsWith('patient_demographics:')).toBe(true);

  const staff = setup();
  await staff.service.saveStaff(staff.request({ patientId, requestId, expectedUpdatedAt: updatedAt, profile }));
  expect(staff.store.saveStaff.mock.calls[0][0].operation.startsWith('staff_patient_demographics:')).toBe(true);
  expect(staff.store.saveStaff.mock.calls[0][0].operation).not.toBe(store.save.mock.calls[0][0].operation);
  staff.store.receipt.mockResolvedValue(store.save.mock.calls[0][0].operation);
  await expect(staff.service.saveStaff(staff.request({ patientId, requestId, expectedUpdatedAt: updatedAt, profile }))).rejects.toMatchObject({ code: 'already-exists' });
});
