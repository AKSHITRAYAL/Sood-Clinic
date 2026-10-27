import { createRequire } from 'node:module';
import { expect, test, vi } from 'vitest';
const require = createRequire(import.meta.url);
const { HttpsError } = require('firebase-functions/v2/https');
const { createBookingReads, firestoreCatalogue, firestoreConfig } = require('../lib/bookingFallback');

// Shapes copied from production: one active branch/department/doctor, no publicConfig.
const legacy = () => ({
  branches: [{ id: 'sood-clinic', name: 'Sood Clinic', timezone: 'Asia/Kolkata', active: true }],
  departments: [{ id: 'gastroenterology', branchId: 'sood-clinic', name: 'Gastroenterology', description: '', sortOrder: 1, active: true, publicBookingEnabled: true }],
  doctors: [{ id: 'brig-ak-sood', branchId: 'sood-clinic', departmentIds: ['gastroenterology'], name: 'Dr. Brig. A. K. Sood VSM (Retd)', qualification: 'MBBS, MD', active: true, bookingEnabled: true, weeklySchedule: [] }],
});
const sqlCatalogue = () => ({ branches: [{ id: 'sql-branch', name: 'SQL branch', timezone: 'Asia/Kolkata' }], departments: [{ id: 'sql-department', branchId: 'sql-branch', name: 'SQL department', description: '', sortOrder: 0 }], doctors: [{ id: 'sql-doctor', branchId: 'sql-branch', departmentIds: ['sql-department'], name: 'SQL doctor', qualification: '' }] });
const sqlConfig = () => ({ bookingWindowDays: 30, leadMinutes: 60, intervalMinutes: 15, bufferBeforeMinutes: 5, bufferAfterMinutes: 10, cancelCutoffMinutes: 240, autoConfirm: true, timezone: 'Asia/Kolkata', patientCancellationCutoffHours: 4, visitTypes: [{ id: 'consultation', label: 'SQL format', minutes: 30, mode: 'in_person', active: true }] });
const failure = (code) => { const error = new HttpsError(code, code === 'not-found' ? 'This doctor is not currently available for online bookings.' : 'Booking configuration is temporarily unavailable.'); return error; };

test('a healthy SQL read is used and Firestore is never touched', async () => {
  const sql = { catalogue: vi.fn(async () => sqlCatalogue()), config: vi.fn(async () => sqlConfig()) };
  const firestore = { catalogue: vi.fn(), config: vi.fn() };
  const reads = createBookingReads({ sql, firestore });
  expect(await reads.catalogue()).toEqual(sqlCatalogue());
  expect(await reads.config()).toEqual(sqlConfig());
  expect((await reads.doctor('sql-doctor')).branchId).toEqual('sql-branch');
  expect(firestore.catalogue).not.toHaveBeenCalled();
  expect(firestore.config).not.toHaveBeenCalled();
});

test('an unusable SQL read falls back to the legacy Firestore catalogue and published defaults', async () => {
  // Both failures production currently produces: the connector lacks the query and
  // `clinic_settings` is unseeded.
  for (const code of ['unavailable', 'failed-precondition']) {
    const sql = { catalogue: vi.fn(async () => { throw failure(code); }), config: vi.fn(async () => { throw failure(code); }) };
    const firestore = { catalogue: vi.fn(async () => firestoreCatalogue(legacy())), config: vi.fn(async () => firestoreConfig(undefined)) };
    const reads = createBookingReads({ sql, firestore });
    expect(await reads.catalogue()).toEqual({ branches: legacy().branches.map(({ id, name, timezone }) => ({ id, name, timezone })), departments: [{ id: 'gastroenterology', branchId: 'sood-clinic', name: 'Gastroenterology', description: '', sortOrder: 1 }], doctors: [{ id: 'brig-ak-sood', branchId: 'sood-clinic', departmentIds: ['gastroenterology'], name: 'Dr. Brig. A. K. Sood VSM (Retd)', qualification: 'MBBS, MD' }] });
    expect(await reads.doctor('brig-ak-sood')).toMatchObject({ id: 'brig-ak-sood', departmentIds: ['gastroenterology'] });
    // Booking preflight reads these fields directly; they must stay whole numbers.
    expect(await reads.config()).toEqual({
      bookingWindowDays: 14, leadMinutes: 30, intervalMinutes: 20, bufferBeforeMinutes: 0, bufferAfterMinutes: 0,
      cancelCutoffMinutes: 120, autoConfirm: false, timezone: 'Asia/Kolkata', patientCancellationCutoffHours: 2,
      visitTypes: [{ id: 'consultation', label: 'In-clinic consultation', minutes: 20, mode: 'in_person', active: true }, { id: 'video-consultation', label: 'Online video consultation', minutes: 20, mode: 'video', active: true }],
    });
  }
});

test('published Firestore settings win over the defaults', async () => {
  expect(firestoreConfig({ bookingWindowDays: 21, intervalMinutes: 30, patientCancellationCutoffHours: 6, autoConfirm: true, visitTypes: [{ id: 'follow-up', label: 'Follow up', minutes: 10, mode: 'video', active: true }] })).toMatchObject({ bookingWindowDays: 21, intervalMinutes: 30, cancelCutoffMinutes: 360, patientCancellationCutoffHours: 6, autoConfirm: true, visitTypes: [{ id: 'follow-up', label: 'Follow up', minutes: 10, mode: 'video', active: true }] });
});

test('unpublished or inactive legacy records never become bookable', () => {
  const rows = legacy();
  const catalogue = firestoreCatalogue({
    branches: [...rows.branches, { id: 'archived', name: 'Archived', active: false }],
    departments: [...rows.departments, { id: 'hidden', branchId: 'sood-clinic', name: 'Hidden', active: true, publicBookingEnabled: false }],
    doctors: [...rows.doctors, { id: 'retired', branchId: 'sood-clinic', departmentIds: ['gastroenterology'], name: 'Retired', active: false, bookingEnabled: true }, { id: 'unlisted', branchId: 'sood-clinic', departmentIds: ['hidden'], name: 'Unlisted', active: true, bookingEnabled: true }],
  });
  expect(catalogue.branches.map((row) => row.id)).toEqual(['sood-clinic']);
  expect(catalogue.departments.map((row) => row.id)).toEqual(['gastroenterology']);
  expect(catalogue.doctors.map((row) => row.id)).toEqual(['brig-ak-sood']);
});

test('malformed published formats fail closed instead of inventing a duration', () => {
  for (const visitTypes of [[{ id: 'consultation', label: 'Bad', minutes: 3, mode: 'in_person' }], [{ id: 'consultation', label: '', minutes: 20, mode: 'in_person' }], [{ id: 'consultation', label: 'A', minutes: 20, mode: 'video' }, { id: 'consultation', label: 'B', minutes: 20, mode: 'in_person' }]]) expect(() => firestoreConfig({ visitTypes })).toThrow();
});

test('when both sources fail the SQL refusal surfaces and no empty catalogue is served', async () => {
  const sqlError = failure('unavailable');
  const reads = createBookingReads({
    sql: { catalogue: async () => { throw sqlError; }, config: async () => { throw sqlError; } },
    firestore: { catalogue: async () => { throw new Error('firestore unavailable'); }, config: async () => { throw new Error('firestore unavailable'); } },
  });
  await expect(reads.catalogue()).rejects.toBe(sqlError);
  await expect(reads.config()).rejects.toBe(sqlError);
  await expect(reads.doctor('brig-ak-sood')).rejects.toBe(sqlError);
});

test('a definitive SQL refusal does not fall back to legacy data', async () => {
  const firestore = { catalogue: vi.fn(), config: vi.fn() };
  const reads = createBookingReads({ sql: { catalogue: async () => { throw failure('not-found'); }, config: async () => ({}) }, firestore });
  await expect(reads.doctor('brig-ak-sood')).rejects.toMatchObject({ code: 'not-found' });
  expect(firestore.catalogue).not.toHaveBeenCalled();
});
