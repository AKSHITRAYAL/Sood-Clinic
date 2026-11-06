const MANAGEMENT_ROLES = new Set(['admin', 'manager']);

export function getAppointmentActions(appointment, role, today, now = Date.now()) {
  const actions = [];
  const isManager = MANAGEMENT_ROLES.has(role);
  const isDoctor = role === 'doctor';
  if ((isManager || isDoctor) && appointment.status === 'scheduled') actions.push({ to: 'confirmed', label: 'Confirm' });
  if ((isManager && ['scheduled', 'confirmed'].includes(appointment.status))
    && appointment.dateKey === today) actions.push({ to: 'checked_in', label: 'Check in' });
  if (isDoctor && appointment.status === 'checked_in') actions.push({ to: 'in_consultation', label: 'Start visit' });
  if (isDoctor && appointment.status === 'in_consultation') actions.push({ to: 'completed', label: 'Complete' });
  if ((isManager || isDoctor) && ['scheduled', 'confirmed'].includes(appointment.status)) {
    actions.push({ to: 'cancelled', label: 'Cancel', needsReason: true });
  }
  const startsAt = Date.parse(appointment.startsAt);
  if (isManager && ['scheduled', 'confirmed'].includes(appointment.status)
    && Number.isFinite(startsAt) && startsAt + 15 * 60_000 <= now) actions.push({ to: 'no_show', label: 'No-show' });
  return actions;
}
