const PATIENT_CANCELLABLE_STATUSES = new Set(['scheduled', 'confirmed']);

const canPatientCancel = ({ appointment, uid, now = new Date(), cutoffHours = 2 }) => {
  if (!appointment || appointment.patientId !== uid || !PATIENT_CANCELLABLE_STATUSES.has(appointment.status)) return false;
  const startsAt = appointment.startsAt?.toDate ? appointment.startsAt.toDate() : new Date(appointment.startsAt);
  if (Number.isNaN(startsAt?.getTime?.())) return false;
  return startsAt.getTime() > now.getTime() + cutoffHours * 60 * 60 * 1000;
};

module.exports = { PATIENT_CANCELLABLE_STATUSES, canPatientCancel };
