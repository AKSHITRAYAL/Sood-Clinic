import { beforeEach, expect, test, vi } from 'vitest';
const { invoke, names } = vi.hoisted(() => ({ invoke: vi.fn(), names: [] }));
vi.mock('firebase/functions', () => ({ httpsCallable: (_functions, name) => async payload => { names.push(name); return invoke(payload); } }));
vi.mock('../lib/firebase', () => ({ functions: {} }));
// Fail-closed proof: the service must never fall back to Firestore for a missing SQL endpoint.
vi.mock('firebase/firestore', () => { throw new Error('sqlPatientService must not import Firestore'); });
import { sqlPatientService } from './sqlPatientService';

const patientId = '50000000-0000-4000-8000-000000000001';
const requestId = '60000000-0000-4000-8000-000000000001';
const updatedAt = '2026-10-20T00:00:00.123456Z';
const demographics = { title: 'Mr.', displayName: 'Synthetic Patient', phone: '+919876543210', dateOfBirth: '2000-02-29', gender: 'Male', maritalStatus: 'Single', addressLine1: 'Synthetic address', city: 'Panchkula', state: 'Haryana', postalCode: '134109', emergencyContactName: 'Synthetic contact', emergencyContactPhone: '+919876500001' };
const health = { bloodGroup: 'AB+', allergies: 'Synthetic allergy', currentMedications: 'Synthetic medication', healthNotes: 'Synthetic notes' };
const row = patch => ({ patientId, uhid: 'TEST-ONLY', relationship: 'self', ...demographics, ...patch });

beforeEach(() => { invoke.mockReset(); names.length = 0; });

test('saveProfile sends only allow-listed fields to the fixed endpoint and rejects unknown shapes', async () => {
  invoke.mockResolvedValue({ data: { saved: true } });
  await expect(sqlPatientService.saveProfile({ patientId, requestId, expectedUpdatedAt: updatedAt, profile: { ...demographics, email: 'private@example.test', bloodGroup: 'AB+' } })).resolves.toEqual({ saved: true });
  expect(names).toEqual(['saveSqlPatientProfile']);
  expect(invoke).toHaveBeenCalledWith({ patientId, profile: demographics, expectedUpdatedAt: updatedAt, requestId });
  for (const patch of [
    { patientId: 'not-a-uuid', profile: demographics },
    { requestId: 'not-a-uuid', profile: demographics },
    { expectedUpdatedAt: '2026-10-20', profile: demographics },
    { profile: { ...demographics, phone: 9876543210 } },
    {},
  ]) {
    await expect(sqlPatientService.saveProfile({ patientId, requestId, expectedUpdatedAt: updatedAt, ...patch })).rejects.toThrow('Patient information could not be confirmed.');
  }
  expect(invoke).toHaveBeenCalledTimes(1);
  invoke.mockResolvedValue({ data: { saved: false } });
  await expect(sqlPatientService.saveProfile({ patientId, requestId, expectedUpdatedAt: updatedAt, profile: demographics })).rejects.toThrow('Patient information could not be confirmed.');
});

test('getProfile returns only allow-listed demographics bound to the requested patient', async () => {
  invoke.mockResolvedValue({ data: { profile: { ...row({ updatedAt, email: 'private@example.test', bloodGroup: 'AB+', healthNotes: 'private-health', legacyCreatedByUid: 'private-actor' }) } } });
  const result = await sqlPatientService.getProfile(patientId);
  expect(Object.keys(result).sort()).toEqual(['addressLine1', 'city', 'dateOfBirth', 'displayName', 'emergencyContactName', 'emergencyContactPhone', 'gender', 'maritalStatus', 'patientId', 'phone', 'postalCode', 'relationship', 'state', 'title', 'uhid', 'updatedAt'].sort());
  expect(result).not.toHaveProperty('email');
  expect(JSON.stringify(result)).not.toContain('private');
  invoke.mockResolvedValue({ data: { profile: row({ updatedAt, patientId: '70000000-0000-4000-8000-000000000009' }) } });
  await expect(sqlPatientService.getProfile(patientId)).rejects.toThrow('Patient information could not be confirmed.');
  invoke.mockResolvedValue({ data: { profile: row({ updatedAt: 'not-a-version' }) } });
  await expect(sqlPatientService.getProfile(patientId)).rejects.toThrow('Patient information could not be confirmed.');
  await expect(sqlPatientService.getProfile('not-a-uuid')).rejects.toThrow('Patient information could not be confirmed.');
});

test('listPatients bounds, deduplicates and validates every row without extra fields', async () => {
  invoke.mockResolvedValue({ data: { patients: [{ patientId, displayName: 'Synthetic', uhid: 'TEST-ONLY', relationship: 'self', email: 'private@example.test' }] } });
  expect(await sqlPatientService.listPatients()).toEqual([{ patientId, displayName: 'Synthetic', uhid: 'TEST-ONLY', relationship: 'self' }]);
  for (const patients of [Array(21).fill(null).map(() => ({ patientId, displayName: 'Synthetic', uhid: 'TEST-ONLY', relationship: 'self' })), [{ patientId, displayName: 'Synthetic', uhid: 'TEST-ONLY', relationship: 'self' }, { patientId, displayName: 'Synthetic', uhid: 'TEST-ONLY', relationship: 'self' }], [{ patientId, displayName: 'Synthetic', uhid: 'TEST-ONLY', relationship: 'other' }], [{ patientId, displayName: '', uhid: 'TEST-ONLY', relationship: 'self' }], null]) {
    invoke.mockResolvedValue({ data: { patients } });
    await expect(sqlPatientService.listPatients()).rejects.toThrow('Patient information could not be confirmed.');
  }
});

test('health round-trip uses only the four self-reported fields', async () => {
  invoke.mockResolvedValue({ data: { patientId, updatedAt, profile: { ...health, doctorNotes: 'private-clinical' } } });
  expect(await sqlPatientService.getHealth(patientId)).toEqual({ patientId, updatedAt, profile: health });
  expect(names).toEqual(['getSqlPatientHealth']);
  invoke.mockResolvedValue({ data: { saved: true } });
  await sqlPatientService.saveHealth({ patientId, requestId, expectedUpdatedAt: updatedAt, profile: health });
  expect(invoke).toHaveBeenCalledWith({ patientId, profile: health, expectedUpdatedAt: updatedAt, requestId });
  // Missing optional health keys read as empty values; saves must still submit all four keys explicitly.
  invoke.mockResolvedValue({ data: { patientId, updatedAt, profile: { bloodGroup: 'AB+' } } });
  expect(await sqlPatientService.getHealth(patientId)).toEqual({ patientId, updatedAt, profile: { bloodGroup: 'AB+', allergies: '', currentMedications: '', healthNotes: '' } });
  await expect(sqlPatientService.saveHealth({ patientId, requestId, expectedUpdatedAt: updatedAt, profile: { bloodGroup: 'AB+' } })).rejects.toThrow('Patient information could not be confirmed.');
});

test('appointments validates cursors, bounds and per-row invariants with fixed IST output', async () => {
  const appointment = { id: patientId, reference: 'SYNTHETIC-001', startsAt: updatedAt, endsAt: '2026-10-20T00:30:00.123456Z', timezone: 'Asia/Kolkata', clinicDate: '2026-10-20', status: 'confirmed', visitMode: 'in_person', updatedAt, doctorName: 'Synthetic Doctor', branchName: 'Synthetic Clinic', branchAddress: 'Synthetic address', serviceName: 'Consultation', reason: 'private-reason' };
  invoke.mockResolvedValue({ data: { appointments: [appointment], nextCursor: { startsAt: updatedAt, reference: 'SYNTHETIC-001' } } });
  const page = await sqlPatientService.appointments(patientId);
  expect(Object.keys(page.appointments[0]).sort()).toEqual(['branchAddress', 'branchName', 'clinicDate', 'doctorName', 'endsAt', 'id', 'reference', 'serviceName', 'startsAt', 'status', 'timezone', 'updatedAt', 'visitMode'].sort());
  expect(page.appointments[0].timezone).toBe('Asia/Kolkata');
  expect(page.nextCursor).toEqual({ startsAt: updatedAt, reference: 'SYNTHETIC-001' });
  for (const bad of [{ ...appointment, timezone: 'UTC' }, { ...appointment, status: 'invented' }, { ...appointment, visitMode: 'phone' }, { ...appointment, endsAt: undefined }, { ...appointment, id: 'not-a-uuid' }, undefined]) {
    invoke.mockResolvedValue({ data: { appointments: [bad], nextCursor: null } });
    await expect(sqlPatientService.appointments(patientId)).rejects.toThrow('Patient information could not be confirmed.');
  }
  invoke.mockResolvedValue({ data: { appointments: Array(21).fill(appointment), nextCursor: null } });
  await expect(sqlPatientService.appointments(patientId)).rejects.toThrow('Patient information could not be confirmed.');
  invoke.mockResolvedValue({ data: { appointments: [], nextCursor: { startsAt: 'bad', reference: 'X' } } });
  await expect(sqlPatientService.appointments(patientId)).rejects.toThrow('Patient information could not be confirmed.');
  await expect(sqlPatientService.appointments(patientId, { startsAt: 'bad', reference: 'X' })).rejects.toThrow('Patient information could not be confirmed.');
  await expect(sqlPatientService.appointments(patientId, { startsAt: updatedAt, reference: 'x'.repeat(121) })).rejects.toThrow('Patient information could not be confirmed.');
});

test('acceptLink requires the complete clinic code and confirmed linkage', async () => {
  const code = 'C'.repeat(43);
  await expect(sqlPatientService.acceptLink('short')).rejects.toThrow('Enter the complete clinic-issued code.');
  expect(invoke).not.toHaveBeenCalled();
  invoke.mockResolvedValue({ data: { linked: true } });
  await expect(sqlPatientService.acceptLink(code)).resolves.toEqual({ linked: true });
  expect(names).toEqual(['acceptSqlPatientLink']);
  expect(invoke).toHaveBeenCalledWith({ code });
  invoke.mockResolvedValue({ data: { linked: false } });
  await expect(sqlPatientService.acceptLink(code)).rejects.toThrow('Patient information could not be confirmed.');
});

test('a missing callable endpoint fails closed with no legacy fallback', async () => {
  invoke.mockRejectedValue(new Error('SqlEndpointMissing'));
  await expect(sqlPatientService.getProfile(patientId)).rejects.toThrow('SqlEndpointMissing');
  expect(names).toEqual(['getSqlPatientProfile']);
});
