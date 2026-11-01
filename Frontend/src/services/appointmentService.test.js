import { expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), names: [] }));
vi.mock('../lib/firebase', () => ({ functions: {} }));
vi.mock('firebase/functions', () => ({
  httpsCallable: (_functions, name) => { mocks.names.push(name); return mocks.invoke; },
}));
import { listStaffAppointments, rescheduleStaffAppointment } from './appointmentService';

test('staff reschedule calls the dedicated callable with exactly the approved fields', async () => {
  mocks.invoke.mockResolvedValueOnce({ data: { ok: true, appointmentId: 'apt-1' } });
  await expect(rescheduleStaffAppointment('apt-1', '2026-10-25', '09:20')).resolves.toEqual({ data: { ok: true, appointmentId: 'apt-1' } });
  expect(mocks.names).toContain('rescheduleAppointment');
  expect(mocks.invoke).toHaveBeenCalledWith({ appointmentId: 'apt-1', dateKey: '2026-10-25', time: '09:20' });
  expect(Object.keys(mocks.invoke.mock.calls[0][0]).sort()).toEqual(['appointmentId', 'dateKey', 'time']);
});

test('a rejected reschedule propagates instead of reporting success', async () => {
  mocks.invoke.mockRejectedValueOnce(new Error('Only an upcoming appointment can be rescheduled.'));
  await expect(rescheduleStaffAppointment('apt-1', '2026-10-25', '09:20')).rejects.toThrow('Only an upcoming appointment can be rescheduled.');
});

test('staff queue uses only the projected callable and passes its scoped cursor unchanged', async () => {
  const cursor = { dateKey: '2026-11-02', id: 'apt-1', seconds: 1793593800, nanoseconds: 123456789 };
  mocks.invoke.mockResolvedValueOnce({ data: { appointments: [], nextCursor: null } });
  await expect(listStaffAppointments('2026-11-02', cursor)).resolves.toEqual({ appointments: [], nextCursor: null });
  expect(mocks.names.at(-1)).toBe('listStaffAppointments');
  expect(mocks.invoke.mock.lastCall).toEqual([{ dateKey: '2026-11-02', cursor }]);
  mocks.invoke.mockResolvedValueOnce({ data: {} });
  await expect(listStaffAppointments('2026-11-02')).rejects.toThrow('Appointments could not be confirmed');
});
