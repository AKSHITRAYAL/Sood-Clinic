import { describe, expect, it } from 'vitest';
import appointmentPolicy from '../lib/appointmentPolicy.js';

const { canPatientCancel } = appointmentPolicy;

describe('patient appointment cancellation policy', () => {
  const now = new Date('2026-10-09T04:00:00.000Z');
  const appointment = (hours) => ({ patientId: 'patient-one', status: 'scheduled', startsAt: new Date(now.getTime() + hours * 60 * 60 * 1000) });
  it('allows the owner to cancel before the cutoff', () => expect(canPatientCancel({ appointment: appointment(3), uid: 'patient-one', now })).toBe(true));
  it('rejects cancellations inside the cutoff and by another patient', () => {
    expect(canPatientCancel({ appointment: appointment(2), uid: 'patient-one', now })).toBe(false);
    expect(canPatientCancel({ appointment: appointment(3), uid: 'patient-two', now })).toBe(false);
  });
});
