import { createRequire } from 'node:module';
import { expect, test, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { createClinicContact } = require('../lib/clinicContact');
const profile = { name: 'Sood Clinic', phone: '+918988207797', email: 'clinic@example.test', address: 'Clinic address', timezone: 'Asia/Kolkata', updatedAt: '2026-10-20T00:00:00.123456Z' };
const request = (data = {}) => ({ auth: { uid: 'admin', token: { role: 'admin', auth_time: 100 } }, data });
const input = () => ({ requestId: '00000000-0000-4000-8000-000000000011', expectedUpdatedAt: profile.updatedAt, profile: { name: profile.name, phone: profile.phone, email: profile.email, address: profile.address } });
function fixture(user = {}) {
  const auth = { getUser: vi.fn(async () => ({ uid: 'admin', disabled: false, customClaims: { role: 'admin' }, ...user })) };
  const store = { read: vi.fn(async () => profile), receipt: vi.fn(async () => null), save: vi.fn(async () => {}) };
  return { store, service: createClinicContact({ auth, store }) };
}

test('loads SQL contact and saves normalized input with server-owned actor/timezone and bound receipt', async () => {
  const { service, store } = fixture();
  await expect(service.get(request())).resolves.toEqual({ profile });
  const data = input(); data.profile.name = ' Sood Clinic ';
  await expect(service.save(request(data))).resolves.toMatchObject({ saved: true });
  expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ actorUid: 'admin', name: 'Sood Clinic', timezone: 'Asia/Kolkata', expectedUpdatedAt: profile.updatedAt, operation: expect.stringMatching(/^clinic_contact:[a-f0-9]{64}$/) }));
});
test('denies non-admin, disabled, demoted, forced and revoked callers before SQL access', async () => {
  for (const user of [{ disabled: true }, { customClaims: { role: 'manager' } }, { customClaims: { role: 'admin', forcePasswordChange: true } }, { tokensValidAfterTime: '1970-01-01T00:01:41Z' }]) {
    const { service, store } = fixture(user);
    await expect(service.save(request(input()))).rejects.toMatchObject({ code: 'permission-denied' });
    expect(store.save).not.toHaveBeenCalled(); expect(store.read).not.toHaveBeenCalled();
  }
  const { service } = fixture();
  for (const role of ['patient', 'manager', 'doctor']) {
    await expect(service.get({ auth: { uid: role, token: { role, auth_time: 100 } }, data: {} })).rejects.toMatchObject({ code: 'permission-denied' });
  }
  await expect(service.get({})).rejects.toMatchObject({ code: 'permission-denied' });
});
test('rejects malformed/oversized/unknown fields and never truncates or trusts client actor/timezone', async () => {
  const { service, store } = fixture();
  const invalid = [null, [], { ...input(), actorUid: 'other' }, { ...input(), requestId: 'bad' }, { ...input(), expectedUpdatedAt: 'yesterday' }];
  for (const patch of [{ phone: '8988207797' }, { email: 'bad' }, { name: 'x'.repeat(161) }, { name: 'bad\nname' }, { address: '' }, { timezone: 'UTC' }, { active: true }]) invalid.push({ ...input(), profile: { ...input().profile, ...patch } });
  for (const data of invalid) await expect(service.save(request(data))).rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(service.get(request({ id: 'other' }))).rejects.toMatchObject({ code: 'invalid-argument' });
  expect(store.save).not.toHaveBeenCalled();
});
test('stale versions and missing singleton do not overwrite or bootstrap data', async () => {
  const { service, store } = fixture();
  await expect(service.save(request({ ...input(), expectedUpdatedAt: '2026-10-19T00:00:00Z' }))).rejects.toMatchObject({ code: 'aborted' });
  store.read.mockResolvedValue(null);
  await expect(service.save(request(input()))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(store.save).not.toHaveBeenCalled();
});
test('same actor/request/payload replays without a write, changed payload conflicts', async () => {
  const { service, store } = fixture();
  await service.save(request(input()));
  const { operation } = store.save.mock.calls[0][0];
  store.receipt.mockResolvedValue(operation); store.save.mockClear();
  await expect(service.save(request(input()))).resolves.toMatchObject({ saved: true });
  await expect(service.save(request({ ...input(), profile: { ...input().profile, name: 'Different clinic' } }))).rejects.toMatchObject({ code: 'already-exists' });
  expect(store.save).not.toHaveBeenCalled();
});
test('lost acknowledgements reconcile committed receipts; unknown outcomes stay uncertain', async () => {
  const { service, store } = fixture();
  store.save.mockImplementation(async ({ operation }) => { store.receipt.mockResolvedValue(operation); throw Error('private SQL detail'); });
  await expect(service.save(request(input()))).resolves.toMatchObject({ saved: true });
  store.receipt.mockResolvedValue(null); store.save.mockRejectedValue(Error('private SQL detail'));
  await expect(service.save(request(input()))).rejects.toMatchObject({ code: 'unavailable', message: expect.not.stringContaining('private SQL') });
  store.save.mockImplementation(async () => { store.read.mockResolvedValue({ ...profile, updatedAt: '2026-10-21T00:00:00Z' }); throw Error('race'); });
  await expect(service.save(request(input()))).rejects.toMatchObject({ code: 'aborted' });
});
