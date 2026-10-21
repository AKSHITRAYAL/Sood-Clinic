import { beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), callable: vi.fn() }));
vi.mock('firebase/functions', () => ({ httpsCallable: mocks.callable }));
vi.mock('../lib/firebase', () => ({ functions: {} }));
import { getBookingSettings, saveBookingSettings } from './bookingSettingsService';
import { getBookingCatalog, readBookingPolicy } from './bookingCatalogService';
import { canPatientChangeAppointment } from '../lib/appointmentState';
beforeEach(() => { vi.clearAllMocks(); mocks.callable.mockReturnValue(mocks.invoke); });
test('admin configuration rejects missing data rather than supplying defaults', async () => {
  mocks.invoke.mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ data: { settings: {}, visitTypes: [], updatedAt: 'version' } });
  await expect(getBookingSettings()).rejects.toThrow('could not be loaded');
  await expect(getBookingSettings()).resolves.toMatchObject({ updatedAt: 'version' });
});
test('settings and single format writes carry the same global revision and unchanged retry ID', async () => {
  mocks.invoke.mockResolvedValue({ data: { saved: true } });
  await saveBookingSettings('settings', { leadMinutes: 10 }, 'version', 'retry');
  expect(mocks.callable).toHaveBeenLastCalledWith({}, 'saveBookingPolicy');
  expect(mocks.invoke).toHaveBeenLastCalledWith({ settings: { leadMinutes: 10 }, expectedUpdatedAt: 'version', requestId: 'retry' });
  await saveBookingSettings('service', { id: 'video' }, 'version', 'retry');
  expect(mocks.callable).toHaveBeenLastCalledWith({}, 'saveBookingVisitTypes');
  expect(mocks.invoke).toHaveBeenLastCalledWith({ record: { id: 'video' }, expectedUpdatedAt: 'version', requestId: 'retry' });
  mocks.invoke.mockResolvedValue({ data: {} });
  await expect(saveBookingSettings('service', {}, 'version', 'retry')).rejects.toThrow('could not be confirmed');
});
test('patient/rescheduling policy uses validated minutes and booking window, with no two-hour/14-day fallback', () => {
  expect(readBookingPolicy({ booking: { bookingWindowDays: 30, cancelCutoffMinutes: 45 } })).toEqual({ bookingWindowDays: 30, cancelCutoffMinutes: 45 });
  for (const booking of [{}, { bookingWindowDays: 0, cancelCutoffMinutes: 0 }, { bookingWindowDays: 91, cancelCutoffMinutes: 120 }, { bookingWindowDays: 14, cancelCutoffMinutes: '120' }, { bookingWindowDays: 14, cancelCutoffMinutes: -1 }]) expect(() => readBookingPolicy({ booking })).toThrow();
});
test('patient action visibility follows configured cutoff/status and stays closed while policy is unavailable', () => {
  const now = Date.parse('2026-10-20T05:00:00Z');
  const appointment = { status: 'confirmed', startsAt: new Date(now + 46 * 60 * 1000) };
  expect(canPatientChangeAppointment(appointment, 45, now)).toBe(true);
  expect(canPatientChangeAppointment(appointment, 46, now)).toBe(false);
  expect(canPatientChangeAppointment(appointment, null, now)).toBe(false);
  expect(canPatientChangeAppointment({ ...appointment, status: 'checked_in' }, 45, now)).toBe(false);
  expect(canPatientChangeAppointment({ ...appointment, startsAt: 'invalid' }, 45, now)).toBe(false);
});
test('public catalogue boundary rejects missing policy rather than enabling frontend booking defaults', async () => {
  mocks.invoke.mockResolvedValueOnce({ data: { booking: { bookingWindowDays: 14 } } }).mockResolvedValueOnce({ data: { booking: { bookingWindowDays: 30, cancelCutoffMinutes: 45 } } });
  await expect(getBookingCatalog()).rejects.toThrow('policy is temporarily unavailable');
  await expect(getBookingCatalog()).resolves.toMatchObject({ booking: { bookingWindowDays: 30 } });
});
