import { toDate } from './time';

// Mirror the server transition table for presentation only. The callable remains
// authoritative and revalidates every requested transition.
const TRANSITIONS = Object.freeze({
  scheduled: Object.freeze({ confirmed: ['manager', 'admin', 'doctor'], checked_in: ['manager', 'admin'], cancelled: ['manager', 'admin', 'doctor'], no_show: ['manager', 'admin'] }),
  confirmed: Object.freeze({ checked_in: ['manager', 'admin'], cancelled: ['manager', 'admin', 'doctor'], no_show: ['manager', 'admin'] }),
  checked_in: Object.freeze({ in_consultation: ['doctor'], cancelled: ['manager', 'admin'] }),
  in_consultation: Object.freeze({ completed: ['doctor'] }),
});

export const allowedAppointmentTransitions = (status, role) => Object.entries(TRANSITIONS[status] || {})
  .filter(([, roles]) => roles.includes(role))
  .map(([to]) => to);

// A no-show can only be recorded after the appointment start plus the grace
// period the server enforces (functions/lib/stateMachine.js). Presentation only:
// the callable re-checks it.
export const NO_SHOW_GRACE_MINUTES = 15;

export const canMarkAppointmentNoShow = (appointment, now = Date.now(), graceMinutes = NO_SHOW_GRACE_MINUTES) => {
  const startsAt = toDate(appointment?.startsAt);
  return ['scheduled', 'confirmed'].includes(appointment?.status)
    && Number.isInteger(graceMinutes) && graceMinutes >= 0 && graceMinutes <= 240
    && startsAt !== null && Number.isFinite(now)
    && startsAt.getTime() + graceMinutes * 60 * 1000 <= now;
};

// Rescheduling keeps the same appointment reference and is available only while
// the visit is still upcoming. Presentation only: the callable re-checks it.
export const RESCHEDULABLE_STATUSES = Object.freeze(['scheduled', 'confirmed']);

export const canStaffRescheduleAppointment = (appointment, role, actorDoctorId) => {
  if (!appointment || !RESCHEDULABLE_STATUSES.includes(appointment.status)) return false;
  if (!['admin', 'manager', 'doctor'].includes(role)) return false;
  if (role === 'doctor' && (!actorDoctorId || appointment.doctorId !== actorDoctorId)) return false;
  return true;
};

export const appointmentActionLabel = (transition) => ({
  reschedule: 'Reschedule',
  confirmed: 'Confirm',
  checked_in: 'Check in',
  in_consultation: 'Start consultation',
  completed: 'Complete',
  cancelled: 'Cancel',
  no_show: 'Mark no-show',
}[transition] || transition.replaceAll('_', ' '));

export const canPatientChangeAppointment = (appointment, cutoffMinutes, now = Date.now()) => {
  const startsAt = toDate(appointment?.startsAt);
  return ['scheduled', 'confirmed'].includes(appointment?.status) && Number.isInteger(cutoffMinutes) && cutoffMinutes >= 0 && cutoffMinutes <= 10080 && startsAt !== null && Number.isFinite(now) && startsAt.getTime() > now + cutoffMinutes * 60 * 1000;
};
