const PATIENT_CANCELLABLE_STATUSES = new Set(['scheduled', 'confirmed']);

// An appointment is active until it reaches a terminal status. An unknown or missing
// status counts as active on purpose: it still holds its time and its day's quota.
const TERMINAL_STATUSES = Object.freeze(['cancelled', 'completed', 'no_show']);
const isActiveAppointment = (status) => !TERMINAL_STATUSES.includes(status);

const canPatientCancel = ({ appointment, uid, now = new Date(), cutoffHours = 2, allowGuest = false }) => {
  if (!appointment || (!allowGuest && appointment.patientId !== uid) || !PATIENT_CANCELLABLE_STATUSES.has(appointment.status)) return false;
  const startsAt = appointment.startsAt?.toDate ? appointment.startsAt.toDate() : new Date(appointment.startsAt);
  if (Number.isNaN(startsAt?.getTime?.())) return false;
  return startsAt.getTime() > now.getTime() + cutoffHours * 60 * 60 * 1000;
};

module.exports = { PATIENT_CANCELLABLE_STATUSES, TERMINAL_STATUSES, canPatientCancel, isActiveAppointment };
