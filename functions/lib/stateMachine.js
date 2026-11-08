const ROLE = Object.freeze({ manager: 'manager', admin: 'admin', doctor: 'doctor' });

const TRANSITIONS = Object.freeze({
  scheduled: Object.freeze({ confirmed: ['manager', 'admin', 'doctor'], checked_in: ['manager', 'admin'], cancelled: ['manager', 'admin', 'doctor'], no_show: ['manager', 'admin'] }),
  confirmed: Object.freeze({ checked_in: ['manager', 'admin'], cancelled: ['manager', 'admin', 'doctor'], no_show: ['manager', 'admin'] }),
  checked_in: Object.freeze({ in_consultation: ['doctor'], cancelled: ['manager', 'admin'] }),
  in_consultation: Object.freeze({ completed: ['doctor'] }),
});

const canTransition = (from, to, role) => Boolean(TRANSITIONS[from]?.[to]?.includes(role));

// A no-show is only knowable once the patient has had time to arrive. The target
// design stores this as `graceMinutes` in booking settings; that field does not
// exist in the SQL settings/config contract yet, so the documented default is a
// constant here until the coordinated schema/API change lands.
const NO_SHOW_GRACE_MINUTES = 15;

const canMarkNoShow = ({ appointment, now = new Date(), graceMinutes = NO_SHOW_GRACE_MINUTES }) => {
  if (!appointment || !['scheduled', 'confirmed'].includes(appointment.status)) return false;
  if (!Number.isInteger(graceMinutes) || graceMinutes < 0 || graceMinutes > 240) return false;
  const startsAt = appointment.startsAt?.toDate ? appointment.startsAt.toDate() : new Date(appointment.startsAt);
  if (Number.isNaN(startsAt?.getTime?.())) return false;
  const at = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(at.getTime())) return false;
  return startsAt.getTime() + graceMinutes * 60 * 1000 <= at.getTime();
};

// Rescheduling moves `startsAt` on the same appointment (the patient keeps one
// reference number) and is allowed only while the visit is still upcoming.
const RESCHEDULABLE_STATUSES = Object.freeze(['scheduled', 'confirmed']);

const canStaffReschedule = ({ appointment, role, actorDoctorId }) => {
  if (!appointment || !RESCHEDULABLE_STATUSES.includes(appointment.status)) return false;
  if (!Object.values(ROLE).includes(role)) return false;
  if (role === ROLE.doctor && (!actorDoctorId || appointment.doctorId !== actorDoctorId)) return false;
  return true;
};

module.exports = { ROLE, TRANSITIONS, NO_SHOW_GRACE_MINUTES, RESCHEDULABLE_STATUSES, canTransition, canMarkNoShow, canStaffReschedule };
