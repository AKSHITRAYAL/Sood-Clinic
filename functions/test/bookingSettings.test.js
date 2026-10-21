import { createRequire } from 'node:module';
import { expect, test, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { createBookingSettings, projectBookingSettings, selectVisitType } = require('../lib/bookingSettings');
const at = '2026-10-20T00:00:00.123456Z';
const settings = { bookingWindowDays: 14, leadMinutes: 30, intervalMinutes: 20, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, cancelCutoffMinutes: 120, autoConfirm: false };
const service = { id: '00000000000040008000000000000004', legacyId: 'consultation', code: 'consultation', name: 'Clinic consultation', durationMinutes: 20, bufferMinutes: 0, consultationMode: 'in_person', active: true, legacySortOrder: 0, updatedAt: at, feePaise: null };
const rows = () => ({ clinicSettings: { ...settings, id: 'primary', updatedAt: at }, services: [service] });
const request = data => ({ auth: { uid: 'admin', token: { role: 'admin', auth_time: 100 } }, data });
const intent = () => ({ requestId: '00000000-0000-4000-8000-000000000011', expectedUpdatedAt: at, settings });
const fixture = () => {
  const auth = { getUser: vi.fn(async () => ({ uid: 'admin', customClaims: { role: 'admin' } })) };
  const store = { read: vi.fn(async () => rows()), receipt: vi.fn(async () => null), saveSettings: vi.fn(async () => {}), saveService: vi.fn(async () => {}) };
  return { auth, store, api: createBookingSettings({ auth, store }) };
};
test('SQL settings preserve minute precision and public format identities without publishing fees or SQL IDs', () => {
  expect(projectBookingSettings(rows())).toEqual({ settings, updatedAt: at, visitTypes: [{ id: 'consultation', label: 'Clinic consultation', minutes: 20, mode: 'in_person', active: true }] });
});
test('incomplete/unmapped/invalid settings or services fail closed without inventing runtime defaults', () => {
  for (const raw of [{ ...rows(), clinicSettings: null }, { ...rows(), clinicSettings: { ...rows().clinicSettings, intervalMinutes: null } }, { ...rows(), services: [{ ...service, legacyId: null }] }, { ...rows(), services: [{ ...service, bufferMinutes: 5 }] }, { ...rows(), services: [{ ...service, active: false }] }, { ...rows(), services: Array(13).fill(service) }]) expect(() => projectBookingSettings(raw)).toThrow();
});
test('hidden consultation cannot reappear through empty or consultation fallback selection', () => {
  const config = { visitTypes: [{ id: 'consultation', active: false }, { id: 'video-consultation', active: true }] };
  expect(() => selectVisitType(config, 'consultation')).toThrow(); expect(() => selectVisitType(config)).toThrow();
  expect(selectVisitType(config, 'video-consultation').id).toBe('video-consultation');
});
test('settings writes require current administrator and strict integer/boolean/field validation', async () => {
  const { api, store, auth } = fixture();
  for (const patch of [{ intervalMinutes: '20' }, { leadMinutes: -1 }, { cancelCutoffMinutes: 1.5 }, { bookingWindowDays: 91 }, { autoConfirm: 'false' }, { timezone: 'UTC' }]) await expect(api.saveSettings(request({ ...intent(), settings: { ...settings, ...patch } }))).rejects.toMatchObject({ code: 'invalid-argument' });
  auth.getUser.mockResolvedValue({ uid: 'admin', customClaims: { role: 'manager' } });
  await expect(api.saveSettings(request(intent()))).rejects.toMatchObject({ code: 'permission-denied' });
  expect(store.saveSettings).not.toHaveBeenCalled();
});
test('settings save binds payload/actor receipt and retry reconciles lost responses without a second write', async () => {
  const { api, store } = fixture();
  store.saveSettings.mockImplementation(async data => { store.receipt.mockResolvedValue(data.operation); throw Error('lost response'); });
  await expect(api.saveSettings(request(intent()))).resolves.toMatchObject({ saved: true });
  await expect(api.saveSettings(request(intent()))).resolves.toMatchObject({ saved: true });
  await expect(api.saveSettings(request({ ...intent(), settings: { ...settings, leadMinutes: 60 } }))).rejects.toMatchObject({ code: 'already-exists' });
  expect(store.saveSettings).toHaveBeenCalledTimes(1);
});
test('formats cannot remove the last active option, change delivery mode or overwrite an old config revision', async () => {
  const { api, store } = fixture();
  const record = { id: 'consultation', label: 'Clinic consultation', minutes: 20, mode: 'in_person', active: false };
  const input = { requestId: intent().requestId, expectedUpdatedAt: at, record };
  await expect(api.saveService(request(input))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(api.saveService(request({ ...input, record: { ...record, active: true, mode: 'video' } }))).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(api.saveSettings(request({ ...intent(), expectedUpdatedAt: '2026-10-19T00:00:00Z' }))).rejects.toMatchObject({ code: 'aborted' });
  expect(store.saveService).not.toHaveBeenCalled();
});
