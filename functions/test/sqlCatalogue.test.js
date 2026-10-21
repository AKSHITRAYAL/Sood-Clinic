import { createRequire } from 'node:module';
import { expect, test, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { createSqlCatalogue, projectCatalogue, publicCatalogue } = require('../lib/sqlCatalogue');
const at = '2026-10-20T00:00:00.123456Z';
const branch = { id: '00000000000040008000000000000001', legacyId: 'main-clinic', name: 'Clinic', code: 'CLINIC', address: 'Clinic address', timezone: 'Asia/Kolkata', active: true, updatedAt: at };
const department = { id: '00000000000040008000000000000002', legacyId: 'gastro', branchId: branch.id, name: 'Gastro', code: 'GASTRO', description: '', active: true, publicBookingEnabled: true, sortOrder: 0, updatedAt: at };
const doctor = { id: '00000000000040008000000000000003', legacyId: 'Dr_Sood', branchId: branch.id, name: 'Doctor', qualification: '', registrationNumber: 'HR886', active: true, bookingEnabled: true, updatedAt: at };
const rows = () => ({ branches: [branch], departments: [department], doctors: [doctor], doctorDepartments: [{ doctorId: doctor.id, departmentId: department.id, sortOrder: 0 }] });
const req = data => ({ auth: { uid: 'admin', token: { role: 'admin', auth_time: 100 } }, data });
const input = () => ({ action: 'branch', requestId: '00000000-0000-4000-8000-000000000011', expectedUpdatedAt: at, record: { id: branch.legacyId, name: 'Updated', code: branch.code, address: branch.address, active: true } });
const fixture = () => {
  const auth = { getUser: vi.fn(async () => ({ uid: 'admin', customClaims: { role: 'admin' } })) };
  const store = { read: vi.fn(async () => rows()), receipt: vi.fn(async () => null), save: vi.fn(async () => {}) };
  return { auth, store, service: createSqlCatalogue({ auth, store }) };
};
test('projection preserves legacy booking/doctor-claim IDs and rejects incomplete or ambiguous identities', () => {
  const result = projectCatalogue(rows());
  expect(result.doctors[0]).toMatchObject({ id: 'Dr_Sood', branchId: 'main-clinic', departmentIds: ['gastro'] });
  expect(result.doctors[0]).not.toHaveProperty('sqlId');
  for (const patch of [{ branches: [{ ...branch, legacyId: null }] }, { departments: [{ ...department, branchId: 'missing' }] }, { doctors: [doctor, { ...doctor, id: 'another-id' }] }, { doctorDepartments: [{ doctorId: doctor.id, departmentId: 'missing', sortOrder: 0 }] }]) expect(() => projectCatalogue({ ...rows(), ...patch })).toThrow();
});
test('public projection hides disabled parents/departments/doctors, versions, codes and private metadata', () => {
  const projected = projectCatalogue(rows());
  expect(publicCatalogue(projected)).toEqual({ branches: [{ id: 'main-clinic', name: 'Clinic', timezone: 'Asia/Kolkata' }], departments: [{ id: 'gastro', branchId: 'main-clinic', name: 'Gastro', description: '', sortOrder: 0 }], doctors: [{ id: 'Dr_Sood', branchId: 'main-clinic', departmentIds: ['gastro'], name: 'Doctor', qualification: '' }] });
  expect(publicCatalogue({ ...projected, branches: [{ ...projected.branches[0], active: false }] })).toEqual({ branches: [], departments: [], doctors: [] });
  expect(publicCatalogue({ ...projected, departments: [{ ...projected.departments[0], publicBookingEnabled: false }] }).doctors).toEqual([]);
});
test('live administrator checks protect catalogue reads/writes before accessing SQL', async () => {
  const { service, store, auth } = fixture();
  auth.getUser.mockResolvedValue({ uid: 'admin', customClaims: { role: 'manager' } });
  await expect(service.get(req({}))).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(service.save(req(input()))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(store.read).not.toHaveBeenCalled(); expect(store.save).not.toHaveBeenCalled();
});
test('strict save validates types, rejects unknown fields, stale edits, reparenting and cross-branch membership', async () => {
  const { service, store } = fixture();
  for (const record of [{ ...input().record, active: 'true' }, { ...input().record, name: 'x'.repeat(161) }, { ...input().record, actorUid: 'other' }]) await expect(service.save(req({ ...input(), record }))).rejects.toMatchObject({ code: 'invalid-argument' });
  await expect(service.save(req({ ...input(), expectedUpdatedAt: null }))).rejects.toMatchObject({ code: 'aborted' });
  await expect(service.save(req({ ...input(), expectedUpdatedAt: '2026-10-19T00:00:00Z' }))).rejects.toMatchObject({ code: 'aborted' });
  const other = { ...branch, id: '00000000000040008000000000000004', legacyId: 'other-clinic', code: 'OTHER' };
  store.read.mockResolvedValue({ ...rows(), branches: [branch, other] });
  const record = { ...projectCatalogue(rows()).doctors[0] }; delete record.updatedAt;
  await expect(service.save(req({ ...input(), action: 'doctor', record: { ...record, branchId: 'other-clinic' } }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(service.save(req({ ...input(), action: 'doctor', record: { ...record, departmentIds: ['missing'] } }))).rejects.toMatchObject({ code: 'failed-precondition' });
  expect(store.save).not.toHaveBeenCalled();
});
test('save uses bound receipts, preserves update identities and safely reconciles a lost response', async () => {
  const { service, store } = fixture();
  store.save.mockImplementation(async data => { store.receipt.mockResolvedValue(data.operation); throw Error('lost response'); });
  await expect(service.save(req(input()))).resolves.toMatchObject({ saved: true });
  const data = store.save.mock.calls[0][0];
  expect(data).toMatchObject({ actorUid: 'admin', id: '00000000-0000-4000-8000-000000000001', legacyId: 'main-clinic', creating: false });
  await expect(service.save(req(input()))).resolves.toMatchObject({ saved: true });
  expect(store.save).toHaveBeenCalledTimes(1);
  await expect(service.save(req({ ...input(), record: { ...input().record, name: 'Changed request' } }))).rejects.toMatchObject({ code: 'already-exists' });
});
test('creation requires explicit absence and duplicate natural keys never adopt another row', async () => {
  const { service, store } = fixture();
  await expect(service.save(req({ ...input(), expectedUpdatedAt: null, record: { ...input().record, id: 'new-clinic' } }))).rejects.toMatchObject({ code: 'already-exists' });
  const data = { ...input(), expectedUpdatedAt: null, record: { ...input().record, id: 'new-clinic', code: 'NEW' } };
  await expect(service.save(req(data))).resolves.toMatchObject({ saved: true });
  expect(store.save).toHaveBeenCalledWith(expect.objectContaining({ id: data.requestId, legacyId: 'new-clinic', creating: true }));
});

test('availability and booking checks consume the same public legacy-ID projection without a fallback', async () => {
  const { service, store } = fixture();
  await expect(service.availableDoctor('Dr_Sood')).resolves.toMatchObject({ id: 'Dr_Sood' });
  await expect(service.validateSelection({ branchId: 'main-clinic', departmentId: 'gastro', doctorId: 'Dr_Sood' })).resolves.toBeUndefined();
  await expect(service.validateSelection({ branchId: 'wrong', departmentId: 'gastro', doctorId: 'Dr_Sood' })).rejects.toMatchObject({ code: 'failed-precondition' });
  store.read.mockResolvedValue({ ...rows(), branches: [{ ...branch, active: false }] });
  await expect(service.availableDoctor('Dr_Sood')).rejects.toMatchObject({ code: 'not-found' });
  store.read.mockRejectedValue(Error('private SQL detail'));
  await expect(service.public()).rejects.toMatchObject({ code: 'unavailable', message: expect.not.stringContaining('private SQL') });
});
test('oversized catalogues and missing legacy identities fail closed rather than truncating or exposing UUIDs', () => {
  expect(() => projectCatalogue({ ...rows(), branches: Array(1001).fill(branch) })).toThrow();
  expect(() => projectCatalogue({ ...rows(), doctors: [{ ...doctor, legacyId: null }] })).toThrow();
});
