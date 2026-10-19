import { beforeEach, expect, test, vi } from 'vitest';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => invoke }));
vi.mock('../lib/firebase', () => ({ functions: {} }));
import { getSqlStaffDirectory, manageStaffAccess } from './staffDirectoryService';

beforeEach(() => { invoke.mockReset(); });
test('passes bounded page parameters and returns directory counts', async () => {
  const data = { staff: [{ uid: 'synthetic' }], total: 2, nextCursor: 'synthetic' };
  invoke.mockResolvedValue({ data });
  expect(await getSqlStaffDirectory({ limit: 1 })).toEqual(data);
  expect(invoke).toHaveBeenCalledWith({ limit: 1 });
});
test('rejects malformed responses without leaking backend details', async () => {
  invoke.mockResolvedValue({ data: { staff: [], total: -1 } });
  await expect(getSqlStaffDirectory()).rejects.toThrow('The staff directory could not be loaded.');
  invoke.mockRejectedValue(new Error('Private backend diagnostic'));
  await expect(getSqlStaffDirectory()).rejects.toThrow('The staff directory could not be loaded.');
});
test('asks for a fresh login when live administrator validation fails', async () => {
  invoke.mockRejectedValue({ code: 'functions/permission-denied' });
  await expect(getSqlStaffDirectory()).rejects.toThrow('Please sign in again.');
});

test('staff action adds a retry identifier and maps uncertain failures safely', async () => {
  invoke.mockResolvedValue({ data: { message: 'Staff account suspended.' } });
  await manageStaffAccess({ action: 'disable', email: 'staff@example.test', disabled: true });
  expect(invoke).toHaveBeenCalledWith(expect.objectContaining({ action: 'disable', requestId: expect.any(String) }));
  invoke.mockRejectedValue(new Error('private provider diagnostics'));
  await expect(manageStaffAccess({ action: 'disable' })).rejects.toThrow('Refresh the directory and activity log');
});
