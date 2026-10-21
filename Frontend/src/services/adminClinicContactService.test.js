import { beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), callable: vi.fn(), clear: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('../lib/firebase', () => ({ functions: {} }));
vi.mock('./clinicProfileService', () => ({ clearClinicContactCache: mocks.clear }));
import { getAdminClinicContact, saveAdminClinicContact } from './adminClinicContactService';
const profile = { name: 'Clinic', phone: '+918988207797', email: 'clinic@example.test', address: 'Clinic address', updatedAt: '2026-10-20T00:00:00Z' };
beforeEach(() => { vi.clearAllMocks(); mocks.callable.mockReturnValue(mocks.invoke); });
test('admin reads use the private callable and reject missing profiles instead of editing defaults', async () => {
  mocks.invoke.mockResolvedValueOnce({ data: { profile } }).mockResolvedValueOnce({ data: {} });
  await expect(getAdminClinicContact()).resolves.toEqual(profile);
  expect(mocks.callable).toHaveBeenCalledWith({}, 'getAdminClinicContact');
  await expect(getAdminClinicContact()).rejects.toThrow('could not be loaded');
});
test('save forwards the exact version/request ID and invalidates public cache only after confirmed success', async () => {
  const input = { profile, requestId: 'retry-id', expectedUpdatedAt: profile.updatedAt };
  mocks.invoke.mockRejectedValueOnce(Error('Reload latest details')).mockResolvedValueOnce({ data: { saved: false } }).mockResolvedValueOnce({ data: { saved: true, message: 'Saved' } });
  await expect(saveAdminClinicContact(input)).rejects.toThrow('Reload latest');
  await expect(saveAdminClinicContact(input)).rejects.toThrow('could not be confirmed');
  expect(mocks.clear).not.toHaveBeenCalled();
  await expect(saveAdminClinicContact(input)).resolves.toMatchObject({ saved: true });
  expect(mocks.invoke).toHaveBeenLastCalledWith(input); expect(mocks.clear).toHaveBeenCalledTimes(1);
});
