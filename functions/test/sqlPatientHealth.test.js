import { createRequire } from 'node:module';
import { expect, test, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { createSqlPatientProfiles } = require('../lib/sqlPatientProfiles');
const patientId = '50000000-0000-4000-8000-000000000001';
const requestId = '60000000-0000-4000-8000-000000000001';
const updatedAt = '2026-10-20T00:00:00.123456Z';
const profile = { bloodGroup: 'AB+', allergies: 'Synthetic allergy', currentMedications: 'Synthetic medication', healthNotes: 'Synthetic notes\nSecond line' };
function setup() {
  const user = { uid: 'patient-account', emailVerified: true, customClaims: {} };
  const row = { relationship: 'self', verifiedBy: 'clinic', verifiedAt: updatedAt, patient: { id: patientId, archivedAt: null, updatedAt, bloodGroup: 'AB+', health: { ...profile, diagnosis: 'private-doctor-note' }, displayName: 'private-name' } };
  const store = { readHealth: vi.fn(async () => row), receipt: vi.fn(async () => null), saveHealth: vi.fn() };
  const service = createSqlPatientProfiles({ auth: { getUser: vi.fn(async () => user) }, store });
  const request = data => ({ auth: { uid: user.uid, token: { email_verified: true, auth_time: 100 } }, data });
  const save = (patch = {}) => service.saveHealth(request({ patientId, requestId, expectedUpdatedAt: updatedAt, profile, ...patch }));
  return { user, row, store, service, request, save };
}
test('health reads return only the explicit self-reported fields and patient revision', async () => {
  const { service, request, store, row } = setup();
  await expect(service.getHealth(request({ patientId }))).resolves.toEqual({ patientId, updatedAt, profile });
  expect(store.readHealth).toHaveBeenCalledWith({ actorUid: 'patient-account', patientId });
  row.patient.health.healthNotes = ' Original\r\n text ';
  expect((await service.getHealth(request({ patientId }))).profile.healthNotes).toBe(' Original\r\n text ');
});
test('a missing optional self-reported row is an empty form, not a fabricated diagnosis', async () => {
  const { row, service, request } = setup(); row.patient.health = null; row.patient.bloodGroup = null;
  await expect(service.getHealth(request({ patientId }))).resolves.toEqual({ patientId, updatedAt, profile: { bloodGroup: null, allergies: null, currentMedications: null, healthNotes: null } });
});
test('guardian, missing/unverified link, archive and all staff roles cannot use the patient health path', async () => {
  for (const patch of [{ relationship: 'guardian' }, { verifiedBy: '' }, { verifiedAt: null }, { patient: { archivedAt: updatedAt } }]) {
    const { row, save, service, request, store } = setup(); Object.assign(row, patch);
    await expect(service.getHealth(request({ patientId }))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(save()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(store.saveHealth).not.toHaveBeenCalled();
  }
  for (const role of ['admin', 'doctor', 'manager']) {
    const { user, save, store } = setup(); user.customClaims = { role };
    await expect(save()).rejects.toMatchObject({ code: 'permission-denied' });
    expect(store.readHealth).not.toHaveBeenCalled();
  }
});
test('health saves require a complete explicit form, reject clinical/identity keys and validate text limits', async () => {
  const { save, store } = setup();
  for (const input of [{ allergies: 'partial' }, { ...profile, diagnosis: 'not-patient-editable' }, { ...profile, patientId }, { ...profile, allergies: 'x'.repeat(2001) }, { ...profile, healthNotes: 'hidden\u0000control' }, { ...profile, bloodGroup: 'invented' }, { ...profile, currentMedications: 123 }]) {
    await expect(save({ profile: input })).rejects.toMatchObject({ code: 'invalid-argument' });
  }
  await expect(save({ profile: { ...profile, healthNotes: ' Line one\r\n\tLine two ' } })).resolves.toEqual({ saved: true });
  expect(store.saveHealth).toHaveBeenCalledWith(expect.objectContaining({ actorUid: 'patient-account', patientId, expectedUpdatedAt: updatedAt, healthNotes: 'Line one\n\tLine two', operation: expect.stringMatching(/^patient_health:/) }));
});
test('health shares native patient revision and reconciles a committed retry without duplicate writes', async () => {
  const { row, save, store } = setup(); row.patient.updatedAt = '2026-10-20T00:00:00.123457Z';
  await expect(save()).rejects.toMatchObject({ code: 'aborted' }); row.patient.updatedAt = updatedAt;
  store.saveHealth.mockImplementation(async data => { store.receipt.mockResolvedValue(data.operation); throw Error('Synthetic lost acknowledgement'); });
  await expect(save()).resolves.toEqual({ saved: true });
  await expect(save()).resolves.toEqual({ saved: true });
  await expect(save({ profile: { ...profile, healthNotes: 'changed' } })).rejects.toMatchObject({ code: 'already-exists' });
  row.relationship = 'guardian';
  await expect(save()).rejects.toMatchObject({ code: 'permission-denied' });
  expect(store.saveHealth).toHaveBeenCalledTimes(1);
});
test('unknown health-write outcomes remain unavailable without reflecting sensitive contents', async () => {
  const { save, store } = setup(); store.saveHealth.mockRejectedValue(Error('private-health SQL error'));
  await expect(save()).rejects.toMatchObject({ code: 'unavailable' });
  await expect(save()).rejects.not.toThrow('private-health');
});
