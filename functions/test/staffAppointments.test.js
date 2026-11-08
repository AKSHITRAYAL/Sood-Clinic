import { createRequire } from 'node:module';
import { expect, test, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { createStaffAppointmentReader } = require('../lib/staffAppointments');
const { Timestamp } = require('firebase-admin/firestore');
const day = '2026-11-02';
const at = Timestamp.fromDate(new Date('2026-11-02T04:30:00Z'));
function fixture(role = 'manager') {
  const claims = { role, ...(role === 'doctor' ? { doctorId: 'brig-ak-sood' } : {}) };
  const user = { uid: 'staff-one', customClaims: claims, disabled: false };
  const auth = { getUser: vi.fn(async () => user) };
  const store = { list: vi.fn(async () => [{ id: 'appointment-a', dateKey: day, doctorId: 'brig-ak-sood', startsAt: at, endsAt: Timestamp.fromMillis(at.toMillis() + 1_800_000), status: 'confirmed', visitMode: 'video', patientSnapshot: { name: 'Synthetic Patient', phone: '+919000000001', email: 'private@example.test', nested: 'PRIVATE' }, reason: 'PRIVATE', videoConsultation: { joinUrl: 'https://example.test/PRIVATE' }, manageTokenHash: 'PRIVATE', externalCalendar: { secret: 'PRIVATE' } }]) };
  const request = data => ({ auth: { uid: user.uid, token: { ...claims, auth_time: Math.floor(Date.now() / 1000) } }, data });
  return { user, auth, store, request, service: createStaffAppointmentReader({ auth, store }) };
}
test('operational appointment projection excludes clinical text, email, meeting links, tokens and arbitrary fields', async () => {
  const f = fixture();
  const result = await f.service(f.request({ dateKey: day }));
  expect(result.appointments).toHaveLength(1);
  expect(result.appointments[0].patientSnapshot).toEqual({ name: 'Synthetic Patient', phone: '+919000000001' });
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE|private@example|joinUrl|manageToken|externalCalendar/);
  expect(result.nextCursor).toBeNull();
});
test('missing, revoked and forced-password staff are refused before store access', async () => {
  const f = fixture();
  await expect(f.service({ data: { dateKey: day } })).rejects.toMatchObject({ code: 'permission-denied' });
  f.user.customClaims = { role: 'patient' };
  await expect(f.service(f.request({ dateKey: day }))).rejects.toMatchObject({ code: 'permission-denied' });
  f.user.customClaims = { role: 'manager', forcePasswordChange: true };
  await expect(f.service(f.request({ dateKey: day }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(f.store.list).not.toHaveBeenCalled();
});
test('doctor scope comes from live claims and a browser cannot add a doctor override', async () => {
  const f = fixture('doctor');
  await f.service(f.request({ dateKey: day }));
  expect(f.store.list).toHaveBeenCalledWith({ dateKey: day, doctorId: 'brig-ak-sood', cursor: null, limit: 101 });
  await expect(f.service(f.request({ dateKey: day, doctorId: 'another-doctor' }))).rejects.toMatchObject({ code: 'invalid-argument' });
});
test('cursor preserves nanoseconds and scope, and invalid dates/cursors are rejected', async () => {
  const f = fixture();
  const rows = await f.store.list();
  f.store.list.mockResolvedValue([rows[0], { ...rows[0], id: 'appointment-b' }]);
  const result = await f.service(f.request({ dateKey: day, limit: 1 }));
  expect(result.nextCursor).toEqual({ dateKey: day, id: 'appointment-a', seconds: at.seconds, nanoseconds: at.nanoseconds });
  await f.service(f.request({ dateKey: day, limit: 1, cursor: result.nextCursor }));
  expect(f.store.list.mock.lastCall[0].cursor).toEqual(result.nextCursor);
  for (const data of [{ dateKey: '2026-02-30' }, { dateKey: day, limit: 101 }, { dateKey: day, cursor: { ...result.nextCursor, dateKey: '2026-11-03' } }, { dateKey: day, cursor: { ...result.nextCursor, nanoseconds: -1 } }]) {
    await expect(f.service(f.request(data))).rejects.toMatchObject({ code: 'invalid-argument' });
  }
});


test('receptionists cannot read the operational appointment board', async () => {
  const f = fixture('receptionist');
  await expect(f.service(f.request({ dateKey: day }))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(f.store.list).not.toHaveBeenCalled();
});
