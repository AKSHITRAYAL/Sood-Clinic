import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('firebase/data-connect', () => ({ getDataConnect: () => ({}) }));
vi.mock('../lib/firebase', () => ({ firebaseApp: {} }));
vi.mock('../../../SQL/generated/clinic/esm/index.esm.js', () => ({ connectorConfig: {}, getPublicClinicContact: mocks.query }));
const profile = { name: 'Clinic', phone: '+918988207797', email: 'clinic@example.com', address: 'Clinic address', timezone: 'Asia/Kolkata' };

beforeEach(() => { vi.resetModules(); mocks.query.mockReset(); });

test('contact reads deduplicate concurrent calls and cache public data', async () => {
  mocks.query.mockResolvedValue({ data: { clinicProfile: profile } });
  const { getClinicContact } = await import('./clinicProfileService');
  const results = await Promise.all([getClinicContact(), getClinicContact()]);
  expect(results).toEqual([profile, profile]);
  await getClinicContact();
  expect(mocks.query).toHaveBeenCalledTimes(1);
});

test('failed and malformed contact responses allow a clean retry without fallback', async () => {
  mocks.query.mockRejectedValueOnce(new Error('Internal backend details'))
    .mockResolvedValueOnce({ data: { clinicProfile: { ...profile, phone: 'bad' } } })
    .mockResolvedValueOnce({ data: { clinicProfile: profile } });
  const { getClinicContact } = await import('./clinicProfileService');
  await expect(getClinicContact()).rejects.toThrow('We could not load');
  await expect(getClinicContact()).rejects.toThrow('We could not load');
  await expect(getClinicContact()).resolves.toEqual(profile);
  expect(mocks.query).toHaveBeenCalledTimes(3);
});

test('confirmed administrator updates can invalidate the public contact cache', async () => {
  mocks.query.mockResolvedValueOnce({ data: { clinicProfile: profile } }).mockResolvedValueOnce({ data: { clinicProfile: { ...profile, name: 'Updated clinic' } } });
  const { getClinicContact, clearClinicContactCache } = await import('./clinicProfileService');
  await getClinicContact(); clearClinicContactCache();
  await expect(getClinicContact()).resolves.toMatchObject({ name: 'Updated clinic' });
  expect(mocks.query).toHaveBeenCalledTimes(2);
});
