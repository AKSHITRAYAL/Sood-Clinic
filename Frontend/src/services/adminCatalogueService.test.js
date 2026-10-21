import { beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('../lib/firebase', () => ({ functions: {} }));
import { getAdminCatalogue, saveAdminCatalogue } from './adminCatalogueService';
beforeEach(() => { vi.clearAllMocks(); mocks.callable.mockReturnValue(mocks.invoke); });
test('admin catalogue rejects malformed responses and retains the existing callable contract', async () => {
  mocks.invoke.mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ data: { branches: [], departments: [], doctors: [] } });
  await expect(getAdminCatalogue()).rejects.toThrow('could not be loaded');
  await expect(getAdminCatalogue()).resolves.toEqual({ branches: [], departments: [], doctors: [] });
  expect(mocks.callable).toHaveBeenCalledWith({}, 'getAdminBookingCatalog');
});
test('saves only editable fields, carries stable retry/version and parses display order once', async () => {
  mocks.invoke.mockResolvedValue({ data: { saved: true, message: 'Saved' } });
  const record = { id: 'gastro', name: 'Gastro', active: true, branchId: 'main', code: 'GASTRO', description: '', sortOrder: '2', publicBookingEnabled: true, updatedAt: '2026-10-20T00:00:00Z', extra: 'never send', timezone: 'UTC' };
  await saveAdminCatalogue('department', record, 'retry-id');
  expect(mocks.invoke).toHaveBeenCalledWith({ action: 'department', requestId: 'retry-id', expectedUpdatedAt: record.updatedAt, record: { id: 'gastro', name: 'Gastro', active: true, branchId: 'main', code: 'GASTRO', description: '', sortOrder: 2, publicBookingEnabled: true } });
  mocks.invoke.mockResolvedValue({ data: { saved: false } });
  await expect(saveAdminCatalogue('branch', {}, 'retry-id')).rejects.toThrow('could not be confirmed');
});
