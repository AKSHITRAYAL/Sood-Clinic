import { beforeEach, expect, test, vi } from 'vitest';
const { invoke, names } = vi.hoisted(() => ({ invoke: vi.fn(), names: [] }));
vi.mock('firebase/functions', () => ({ httpsCallable: (_functions, name) => async payload => { names.push(name); return invoke(payload); } }));
vi.mock('../lib/firebase', () => ({ functions: {} }));
import { sqlClinicDayService } from './sqlClinicDayService';

const doctorId = 'DOC-71';
const date = '2026-10-20';
const fail = 'The clinic day response is unavailable. Refresh before continuing.';
const row = patch => ({
  id: 'a0000000-0000-4000-8000-000000000001', reference: 'SYNTHETIC-DAY-001',
  startsAt: '2026-10-20T04:30:00.123456Z', endsAt: '2026-10-20T05:00:00.123456Z',
  updatedAt: '2026-10-20T04:31:00.123456Z', clinicDate: date, status: 'confirmed',
  visitMode: 'in_person', branchName: 'Synthetic Clinic', serviceName: 'Consultation', ...patch,
});
const response = patch => ({ data: { doctorId, date, timezone: 'Asia/Kolkata', doctorName: 'Synthetic Doctor', appointments: [row()], nextCursor: null, ...patch } });

beforeEach(() => { invoke.mockReset(); names.length = 0; });

test('sends only the whitelisted payload and returns only whitelisted fields', async () => {
  invoke.mockResolvedValue(response({ patientName: 'must-not-leak', appointments: [row({ patientName: 'PHI-LEAK', phone: '+919999999999' })] }));
  const result = await sqlClinicDayService.list(doctorId, date);
  expect(names).toEqual(['listSqlStaffClinicDay']);
  expect(invoke).toHaveBeenCalledWith({ doctorId, date });
  expect(result).toEqual({
    doctorId, date, doctorName: 'Synthetic Doctor', timezone: 'Asia/Kolkata', nextCursor: null,
    appointments: [{
      id: 'a0000000-0000-4000-8000-000000000001', reference: 'SYNTHETIC-DAY-001',
      startsAt: '2026-10-20T04:30:00.123456Z', endsAt: '2026-10-20T05:00:00.123456Z',
      updatedAt: '2026-10-20T04:31:00.123456Z', clinicDate: date, status: 'confirmed',
      visitMode: 'in_person', branchName: 'Synthetic Clinic', serviceName: 'Consultation',
    }],
  });
  expect(JSON.stringify(result)).not.toMatch(/patient|phone|99999/i);
});

test('invalid doctor, date and cursor inputs fail before any callable work', async () => {
  for (const args of [
    ['x', date], [doctorId, '2026-10-3'], [doctorId, '2026-13-99'], [doctorId, '2026-02-30'],
    ['', date], [doctorId, date, { startsAt: 'bad', reference: 'SYNTHETIC-DAY-001' }],
    [doctorId, date, { startsAt: '2026-10-20T04:30:00.123456Z', reference: '' }],
    [doctorId, date, { startsAt: '2026-10-20T04:30:00.123456Z', reference: 'r'.repeat(121) }],
    [doctorId, date, { startsAt: '2026-10-20T04:30:00.123456Z' }],
  ]) {
    await expect(sqlClinicDayService.list(...args)).rejects.toThrow(fail);
  }
  expect(invoke).not.toHaveBeenCalled();
});

test('a valid cursor round-trips unchanged in the payload', async () => {
  invoke.mockResolvedValue(response({ appointments: [] }));
  const cursor = { startsAt: '2026-10-20T04:30:00.123456Z', reference: 'SYNTHETIC-DAY-001' };
  await sqlClinicDayService.list(doctorId, date, cursor);
  expect(invoke).toHaveBeenCalledWith({ doctorId, date, cursor });
});

test('malformed or cross-scope envelopes fail closed', async () => {
  for (const data of [
    undefined, {},
    { ...response().data, doctorId: 'DOC-72' },
    { ...response().data, date: '2026-10-21' },
    { ...response().data, timezone: 'UTC' },
    { ...response().data, doctorName: '' },
    { ...response().data, appointments: 'none' },
    { ...response().data, appointments: Array(21).fill(row()) },
    { ...response().data, doctorName: 'Synthetic Doctor\u0007' },
  ]) {
    invoke.mockResolvedValue({ data });
    await expect(sqlClinicDayService.list(doctorId, date)).rejects.toThrow(fail);
  }
});

test('malformed appointment rows fail closed', async () => {
  for (const patch of [
    { id: 'not-a-uuid' }, { reference: '' },
    { reference: 'SYNTHETIC-DAY-001\n' }, { startsAt: 'bad' }, { endsAt: '2026-10-20T04:30:00.123456Z' },
    { endsAt: '2026-10-20T04:00:00.123456Z' }, { updatedAt: 'bad' }, { clinicDate: '2026-10-19' },
    { status: 'invented' }, { visitMode: 'phone' }, { branchName: '' }, { serviceName: '' },
  ]) {
    invoke.mockResolvedValue(response({ appointments: [row(patch)] }));
    await expect(sqlClinicDayService.list(doctorId, date)).rejects.toThrow(fail);
  }
  invoke.mockResolvedValue(response({ appointments: [row(), row()] }));
  await expect(sqlClinicDayService.list(doctorId, date)).rejects.toThrow(fail);
});

test('a next cursor that does not match the last returned row fails closed', async () => {
  invoke.mockResolvedValue(response({ nextCursor: { startsAt: '2026-10-20T04:30:00.123456Z', reference: 'SYNTHETIC-DAY-999' } }));
  await expect(sqlClinicDayService.list(doctorId, date)).rejects.toThrow(fail);
  invoke.mockResolvedValue(response({ appointments: [], nextCursor: { startsAt: '2026-10-20T04:30:00.123456Z', reference: 'SYNTHETIC-DAY-001' } }));
  await expect(sqlClinicDayService.list(doctorId, date)).rejects.toThrow(fail);
  invoke.mockResolvedValue(response({ nextCursor: { startsAt: 'bad', reference: 'SYNTHETIC-DAY-001' } }));
  await expect(sqlClinicDayService.list(doctorId, date)).rejects.toThrow(fail);
});

test('a cursor matching the last row passes through as the next page position', async () => {
  invoke.mockResolvedValue(response({ nextCursor: { startsAt: '2026-10-20T04:30:00.123456Z', reference: 'SYNTHETIC-DAY-001' } }));
  const result = await sqlClinicDayService.list(doctorId, date);
  expect(result.nextCursor).toEqual({ startsAt: '2026-10-20T04:30:00.123456Z', reference: 'SYNTHETIC-DAY-001' });
});
