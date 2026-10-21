import { createRequire } from 'node:module';
import { expect, test, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { createSqlPatientAppointments } = require('../lib/sqlPatientAppointments');
const patientId = '50000000-0000-4000-8000-000000000001';
const appointmentId = '60000000-0000-4000-8000-000000000001';
const startsAt = '2026-10-20T03:00:00.123456Z';
const makeRow = (index = 1) => ({ id: `60000000000040008000${String(index).padStart(12, '0')}`, reference: `SYNTHETIC-${index}`, patientId: patientId.replaceAll('-', ''), startsAt, endsAt: '2026-10-20T03:30:00.123456Z', clinicDate: '2026-10-20', status: 'confirmed', visitMode: 'in_person', updatedAt: startsAt, doctor: { name: 'Synthetic Doctor', legacyCreatedBy: 'private' }, branch: { name: 'Synthetic Branch', address: 'Synthetic clinic', timezone: 'Asia/Kolkata' }, service: { name: 'Consultation' }, reason: 'private-health', videoJoinUrl: 'private-capability', snapshotPhone: 'private-contact' });
function setup() {
  const user = { uid: 'patient-account', emailVerified: true, customClaims: {} };
  const envelope = { user: { active: true }, patientLink: { relationship: 'self', verifiedBy: 'clinic', verifiedAt: startsAt, patient: { id: patientId, archivedAt: null, appointments: [makeRow()] } } };
  const store = { list: vi.fn(async () => envelope), get: vi.fn(async () => envelope) };
  const service = createSqlPatientAppointments({ auth: { getUser: vi.fn(async () => user) }, store });
  const request = data => ({ auth: { uid: user.uid, token: { email_verified: true, auth_time: 100 } }, data });
  return { user, envelope, store, service, request };
}
test('appointment history uses an explicit accepted link and returns only operational fields', async () => {
  const { service, request, store } = setup();
  const result = await service.list(request({ patientId }));
  expect(result.appointments[0]).toEqual({ id: appointmentId, reference: 'SYNTHETIC-1', startsAt, endsAt: '2026-10-20T03:30:00.123456Z', clinicDate: '2026-10-20', status: 'confirmed', visitMode: 'in_person', updatedAt: startsAt, doctorName: 'Synthetic Doctor', branchName: 'Synthetic Branch', branchAddress: 'Synthetic clinic', serviceName: 'Consultation', timezone: 'Asia/Kolkata' });
  expect(result.nextCursor).toBeNull();
  expect(store.list).toHaveBeenCalledWith({ actorUid: 'patient-account', patientId, cursor: null });
  expect((await service.get(request({ patientId, appointmentId }))).appointment.id).toBe(appointmentId);
});
test('pagination keeps native microseconds and uses timestamp plus unique reference for tied starts', async () => {
  const { envelope, service, request, store } = setup();
  envelope.patientLink.patient.appointments = Array.from({ length: 21 }, (_, n) => makeRow(21 - n));
  const first = await service.list(request({ patientId }));
  expect(first.appointments).toHaveLength(20);
  expect(first.nextCursor).toEqual({ startsAt, reference: 'SYNTHETIC-2' });
  envelope.patientLink.patient.appointments = [makeRow(1)];
  await service.list(request({ patientId, cursor: first.nextCursor }));
  expect(store.list).toHaveBeenLastCalledWith({ actorUid: 'patient-account', patientId, cursor: first.nextCursor });
});
test('inactive account, missing/unverified link, wrong patient and archive fail closed', async () => {
  for (const change of [e => { e.user.active = false; }, e => { e.patientLink = null; }, e => { e.patientLink.verifiedBy = ''; }, e => { e.patientLink.relationship = 'unknown'; }, e => { e.patientLink.patient.archivedAt = startsAt; }, e => { e.patientLink.patient.id = appointmentId; }]) {
    const { envelope, service, request } = setup(); change(envelope);
    await expect(service.list(request({ patientId }))).rejects.toMatchObject({ code: 'permission-denied' });
    await expect(service.get(request({ patientId, appointmentId }))).rejects.toMatchObject({ code: 'permission-denied' });
  }
});
test('current Auth and strict inputs are checked before querying SQL', async () => {
  const { user, service, request, store } = setup();
  for (const data of [{ patientId: 'legacy-uid' }, { patientId, actorUid: 'someone-else' }, { patientId, cursor: { startsAt: 'bad', id: appointmentId } }, { patientId, cursor: { startsAt, id: appointmentId, offset: 99 } }]) {
    await expect(service.list(request(data))).rejects.toMatchObject({ code: 'invalid-argument' });
  }
  user.customClaims = { role: 'doctor' };
  await expect(service.list(request({ patientId }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(store.list).not.toHaveBeenCalled();
});
test('malformed/foreign/duplicate/unordered results never leak a partial page', async () => {
  for (const rows of [[{ ...makeRow(), patientId: appointmentId }], [{ ...makeRow(), status: 'invented' }], [{ ...makeRow(), visitMode: null }], [{ ...makeRow(), endsAt: startsAt }], [{ ...makeRow(), clinicDate: '2026-10-19' }], [makeRow(), makeRow()], [makeRow(1), { ...makeRow(2), startsAt: '2026-10-20T03:00:00.123457Z' }], Array(22).fill(makeRow())]) {
    const { envelope, service, request } = setup(); envelope.patientLink.patient.appointments = rows;
    await expect(service.list(request({ patientId }))).rejects.toMatchObject({ code: 'failed-precondition' });
  }
});
test('unknown detail IDs return generic not-found; transport errors never expose SQL or private contents', async () => {
  const { envelope, service, request, store } = setup();
  envelope.patientLink.patient.appointments = [];
  await expect(service.get(request({ patientId, appointmentId }))).rejects.toMatchObject({ code: 'not-found' });
  store.list.mockRejectedValue(Error('private-contact private-health SQL credentials'));
  await expect(service.list(request({ patientId }))).rejects.toMatchObject({ code: 'unavailable' });
  await expect(service.list(request({ patientId }))).rejects.not.toThrow('private-contact');
});
