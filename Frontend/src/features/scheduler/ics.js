const escapeIcs = (value) => String(value || '')
  .replace(/\\/g, '\\\\')
  .replace(/;/g, '\\;')
  .replace(/,/g, '\\,')
  .replace(/\r?\n/g, '\\n');

const formatUtc = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('A valid appointment time is required.');
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
};

export const appointmentIcs = ({ reference, title, startsAt, endsAt, location = 'Sood Clinic, Panchkula', description = '' }) => {
  const uid = `${escapeIcs(reference || 'appointment')}@sood-clinic`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sood Clinic//Scheduler//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${formatUtc(new Date())}`,
    `DTSTART:${formatUtc(startsAt)}`,
    `DTEND:${formatUtc(endsAt)}`,
    `SUMMARY:${escapeIcs(title || 'Sood Clinic appointment')}`,
    `LOCATION:${escapeIcs(location)}`,
    `DESCRIPTION:${escapeIcs(description || `Reference ${reference || ''}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
};

export const downloadIcs = (appointment) => {
  const blob = new Blob([appointmentIcs(appointment)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${appointment.reference || 'sood-clinic-appointment'}.ics`;
  anchor.click();
  URL.revokeObjectURL(url);
};
