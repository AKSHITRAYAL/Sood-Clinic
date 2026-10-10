// Mirror the server transition table for presentation only. The callable remains
// authoritative and revalidates every requested transition.
const TRANSITIONS = Object.freeze({
  scheduled: Object.freeze({ confirmed: ['reception', 'admin', 'doctor'], checked_in: ['reception', 'admin'], cancelled: ['reception', 'admin', 'doctor'], no_show: ['reception', 'admin'] }),
  confirmed: Object.freeze({ checked_in: ['reception', 'admin'], cancelled: ['reception', 'admin', 'doctor'], no_show: ['reception', 'admin'] }),
  checked_in: Object.freeze({ in_consultation: ['doctor'], cancelled: ['reception', 'admin'] }),
  in_consultation: Object.freeze({ completed: ['doctor'] }),
});

export const allowedAppointmentTransitions = (status, role) => Object.entries(TRANSITIONS[status] || {})
  .filter(([, roles]) => roles.includes(role))
  .map(([to]) => to);

export const appointmentActionLabel = (transition) => ({
  confirmed: 'Confirm',
  checked_in: 'Check in',
  in_consultation: 'Start consultation',
  completed: 'Complete',
  cancelled: 'Cancel',
  no_show: 'Mark no-show',
}[transition] || transition.replaceAll('_', ' '));
