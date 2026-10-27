import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import stateMachine from '../lib/stateMachine.js';

const { RESCHEDULABLE_STATUSES, canStaffReschedule } = stateMachine;
const appointment = (patch = {}) => ({ id: 'apt-1', status: 'scheduled', doctorId: 'brig-ak-sood', dateKey: '2026-10-24', ...patch });

describe('staff reschedule policy', () => {
  it('allows admin and manager to move any upcoming appointment', () => {
    for (const role of ['admin', 'manager']) {
      for (const status of ['scheduled', 'confirmed']) expect(canStaffReschedule({ appointment: appointment({ status }), role })).toBe(true);
    }
  });

  it('lets a doctor move only their own upcoming appointment', () => {
    expect(canStaffReschedule({ appointment: appointment(), role: 'doctor', actorDoctorId: 'brig-ak-sood' })).toBe(true);
    expect(canStaffReschedule({ appointment: appointment(), role: 'doctor', actorDoctorId: 'other-doctor' })).toBe(false);
    expect(canStaffReschedule({ appointment: appointment(), role: 'doctor' })).toBe(false);
    expect(canStaffReschedule({ appointment: appointment(), role: 'doctor', actorDoctorId: '' })).toBe(false);
  });

  it('refuses closed or started appointments and unknown roles', () => {
    for (const status of ['checked_in', 'in_consultation', 'completed', 'cancelled', 'no_show', undefined]) {
      expect(canStaffReschedule({ appointment: appointment({ status }), role: 'admin' })).toBe(false);
    }
    for (const role of ['patient', 'guest', undefined, null]) expect(canStaffReschedule({ appointment: appointment(), role })).toBe(false);
    expect(canStaffReschedule({ role: 'admin' })).toBe(false);
    expect([...RESCHEDULABLE_STATUSES]).toEqual(['scheduled', 'confirmed']);
  });
});

describe('frontend mirror parity', () => {
  it('presents rescheduling exactly when the server policy allows it', async () => {
    const frontend = await import('../../Frontend/src/lib/appointmentState.js');
    expect([...frontend.RESCHEDULABLE_STATUSES]).toEqual([...RESCHEDULABLE_STATUSES]);
    for (const role of ['admin', 'manager', 'doctor', 'patient']) {
      for (const status of ['scheduled', 'confirmed', 'checked_in', 'completed', 'cancelled']) {
        for (const doctorId of ['brig-ak-sood', 'other-doctor', undefined]) {
          expect(frontend.canStaffRescheduleAppointment(appointment({ status }), role, doctorId))
            .toBe(canStaffReschedule({ appointment: appointment({ status }), role, actorDoctorId: doctorId }));
        }
      }
    }
    expect(frontend.appointmentActionLabel('reschedule')).toBe('Reschedule');
  });
});

// The callable needs the Firebase Admin runtime, so its contract is asserted from
// source: live Auth first, ownership and status re-checked inside the transaction,
// and the old slot released with the new one reserved atomically.
describe('rescheduleAppointment wiring', () => {
  const body = () => {
    const text = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
    const start = text.indexOf('exports.rescheduleAppointment');
    return text.slice(start, text.indexOf('exports.closeDay', start));
  };

  it('requires current staff access, a doctor-owned appointment and an upcoming status', () => {
    const source = body();
    expect(source).not.toHaveLength(0);
    expect(source).toContain('await requireLiveStaff(admin.auth(), request)');
    expect(source).toContain("if (role === 'doctor' && appointment.doctorId !== request.auth.token.doctorId)");
    expect(source).toContain("if (role === 'doctor' && current.doctorId !== request.auth.token.doctorId)");
    expect(source.match(/canStaffReschedule\(/g)).toHaveLength(2);
    expect(source).toContain('^[A-Za-z0-9_-]{1,200}$');
  });

  it('validates the requested time and reuses the booked-slot contract', () => {
    const source = body();
    expect(source).toContain('^\\d{4}-\\d{2}-\\d{2}$');
    expect(source).toContain('^([01]\\d|2[0-3]):[0-5]\\d$');
    expect(source).toContain('buildAvailability(');
    expect(source).toContain("if (newSlot.exists) throw publicError('already-exists'");
    expect(source).toContain("throw publicError('failed-precondition', 'Choose a different appointment time.')");
  });

  it('releases the old slot and reserves the new one in one transaction with event and audit', () => {
    const source = body();
    expect(source).toContain('await db.runTransaction(');
    expect(source).toContain('existingSlotIds.forEach((slotId) => transaction.delete(');
    expect(source).toContain('transaction.set(newSlotRef');
    expect(source).toContain("meta: { action: 'rescheduled'");
    expect(source).toContain("action: 'appointment_rescheduled'");
    expect(source).toContain('byStaff: true');
  });
});
