import { beforeEach, expect, test, vi } from 'vitest';
const { invoke, names } = vi.hoisted(() => ({ invoke: vi.fn(), names: [] }));
vi.mock('firebase/functions', () => ({ httpsCallable: (_functions, name) => async payload => { names.push(name); return invoke(payload); } }));
vi.mock('../lib/firebase', () => ({ functions: {} }));
import { sqlStaffPatientService } from './sqlStaffPatientService';

const patientId = '50000000-0000-4000-8000-000000000001';
const requestId = '60000000-0000-4000-8000-000000000001';
const updatedAt = '2026-10-20T00:00:00.123456Z';
const profile = { title: 'Mr.', displayName: 'Synthetic Patient', phone: '+919876543210', dateOfBirth: '2000-02-29', gender: 'Male', maritalStatus: 'Single', addressLine1: 'Synthetic address', city: 'Panchkula', state: 'Haryana', postalCode: '134109', emergencyContactName: '', emergencyContactPhone: '' };

beforeEach(() => { invoke.mockReset(); names.length = 0; });

test('search sends exactly one exact key and returns only UUID/UHID/name/phone', async () => {
  invoke.mockResolvedValue({ data: { patients: [{ patientId, uhid: 'TEST-ONLY', displayName: 'Synthetic Patient', phone: '+919876543210', email: 'private@example.test', healthNotes: 'private-health', relationship: 'self', archivedAt: null }] } });
  expect(await sqlStaffPatientService.search('uhid', '  TEST-ONLY  ')).toEqual([{ patientId, uhid: 'TEST-ONLY', displayName: 'Synthetic Patient', phone: '+919876543210' }]);
  expect(names).toEqual(['searchSqlStaffPatients']);
  expect(invoke).toHaveBeenCalledWith({ uhid: 'TEST-ONLY' });
  await sqlStaffPatientService.search('phone', '+919876543210');
  expect(invoke).toHaveBeenLastCalledWith({ phone: '+919876543210' });
  for (const [kind, value] of [['name', 'Synthetic'], ['email', 'x@y.test'], ['uhid', ''], ['uhid', '   '], ['uhid', 'x'.repeat(65)], ['phone', null], ['uhid', ['SYN-1']], [undefined, 'SYN-1']]) {
    await expect(sqlStaffPatientService.search(kind, value)).rejects.toThrow('Patient registry details could not be confirmed.');
  }
  expect(invoke).toHaveBeenCalledTimes(2);
});

test('search fails closed on oversized, duplicate and malformed registry rows', async () => {
  for (const patients of [Array(21).fill(null).map(() => ({ patientId, uhid: 'TEST-ONLY', displayName: 'Synthetic', phone: '' })), [{ patientId, uhid: 'TEST-ONLY', displayName: 'Synthetic', phone: '' }, { patientId, uhid: 'OTHER', displayName: 'Synthetic', phone: '' }], [{ patientId: 'not-a-uuid', uhid: 'TEST-ONLY', displayName: 'Synthetic' }], [{ patientId, uhid: '', displayName: 'Synthetic' }], [{ patientId, uhid: 'TEST-ONLY', displayName: 7 }], null]) {
    invoke.mockResolvedValue({ data: { patients } });
    await expect(sqlStaffPatientService.search('uhid', 'TEST-ONLY')).rejects.toThrow('Patient registry details could not be confirmed.');
  }
});

test('getProfile returns the demographic allow-list only and binds the requested patient', async () => {
  invoke.mockResolvedValue({ data: { profile: { patientId, uhid: 'TEST-ONLY', updatedAt, ...profile, email: 'private@example.test', bloodGroup: 'AB+', healthNotes: 'private-health', legacyCreatedByUid: 'private-actor', relationship: 'self' } } });
  const result = await sqlStaffPatientService.getProfile(patientId);
  expect(Object.keys(result).sort()).toEqual(['addressLine1', 'city', 'dateOfBirth', 'displayName', 'emergencyContactName', 'emergencyContactPhone', 'gender', 'maritalStatus', 'patientId', 'phone', 'postalCode', 'state', 'title', 'uhid', 'updatedAt'].sort());
  expect(JSON.stringify(result)).not.toContain('private');
  await sqlStaffPatientService.getProfile(patientId);
  expect(names).toEqual(['getSqlStaffPatientProfile', 'getSqlStaffPatientProfile']);
  for (const bad of [row => ({ ...row, patientId: '70000000-0000-4000-8000-000000000009' }), row => ({ ...row, updatedAt: 'bad' }), row => ({ ...row, uhid: '' }), () => undefined]) {
    invoke.mockResolvedValue({ data: { profile: bad({ patientId, uhid: 'TEST-ONLY', updatedAt, ...profile }) } });
    await expect(sqlStaffPatientService.getProfile(patientId)).rejects.toThrow('Patient registry details could not be confirmed.');
  }
  await expect(sqlStaffPatientService.getProfile('not-a-uuid')).rejects.toThrow('Patient registry details could not be confirmed.');
});

test('saveProfile sends only allow-listed demographics and confirms the write', async () => {
  invoke.mockResolvedValue({ data: { saved: true } });
  await expect(sqlStaffPatientService.saveProfile({ patientId, requestId, expectedUpdatedAt: updatedAt, profile: { ...profile, healthNotes: 'not-demographic', email: 'x@y.test' } })).resolves.toEqual({ saved: true });
  expect(names).toEqual(['saveSqlStaffPatientProfile']);
  expect(invoke).toHaveBeenCalledWith({ patientId, profile, expectedUpdatedAt: updatedAt, requestId });
  for (const patch of [{ patientId: 'bad' }, { requestId: 'bad' }, { expectedUpdatedAt: '2026-10-20' }, { profile: { ...profile, phone: 9876543210 } }, {}]) {
    await expect(sqlStaffPatientService.saveProfile({ patientId, requestId, expectedUpdatedAt: updatedAt, ...patch })).rejects.toThrow('Patient registry details could not be confirmed.');
  }
  invoke.mockResolvedValue({ data: {} });
  await expect(sqlStaffPatientService.saveProfile({ patientId, requestId, expectedUpdatedAt: updatedAt, profile })).rejects.toThrow('Patient registry details could not be confirmed.');
});
