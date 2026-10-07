export const toDate = (value) => {
  if (value == null) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatDateTime = (value, options = {}) => {
  const date = toDate(value);
  return date ? date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata', ...options }) : 'Time unavailable';
};

export const patientName = (appointment) => appointment.patientSnapshot?.name || appointment.patient?.name || 'Patient';
export const patientPhone = (appointment) => appointment.patientSnapshot?.phone || appointment.patient?.phone || 'No phone number';
