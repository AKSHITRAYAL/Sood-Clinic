const { addIstDays, istDateKey, istInstant, weekdayIst } = require('./ist');

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const minutesFor = (value) => {
  if (!TIME.test(value || '')) return NaN;
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
};

const timeFor = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const validSessions = (sessions, includeWeekday = false) => (Array.isArray(sessions) ? sessions : [])
  .filter((session) => session && TIME.test(session.start) && TIME.test(session.end)
    && minutesFor(session.start) < minutesFor(session.end)
    && (!includeWeekday || Number.isInteger(session.weekday)));

const windowsForDate = ({ dateKey, weeklySessions, exception }) => {
  const regular = validSessions(weeklySessions, true)
    .filter((session) => session.weekday === weekdayIst(dateKey))
    .map(({ start, end }) => ({ start, end }));
  const exceptional = validSessions(exception?.sessions);
  if (exception?.type === 'closed') return [];
  if (exception?.type === 'replace') return exceptional;
  if (exception?.type === 'extra') return [...regular, ...exceptional];
  return regular;
};

const overlaps = (start, end, busyStart, busyEnd) => start < busyEnd && end > busyStart;

const makeSlotId = (doctorId, dateKey, time) => `${doctorId}_${dateKey.replaceAll('-', '')}_${time.replace(':', '')}`;

/**
 * Produces bookable, half-open IST intervals. All caller-supplied busy values are
 * absolute instants; weekly sessions and exceptions deliberately remain local IST.
 */
const buildAvailability = ({
  doctorId,
  dateKey,
  weeklySessions,
  exception,
  durationMinutes = 20,
  intervalMinutes = durationMinutes,
  bufferBeforeMinutes = 0,
  bufferAfterMinutes = 0,
  leadMinutes = 30,
  bookingWindowDays = 14,
  now = new Date(),
  busyRanges = [],
}) => {
  if (!doctorId || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('A doctor and valid appointment date are required.');
  if (![durationMinutes, intervalMinutes, bufferBeforeMinutes, bufferAfterMinutes, leadMinutes, bookingWindowDays].every(Number.isFinite)
    || durationMinutes < 5 || intervalMinutes < 5 || durationMinutes > 480 || intervalMinutes > 480) throw new Error('Invalid appointment timing configuration.');

  const today = istDateKey(now);
  const lastBookableDate = addIstDays(today, bookingWindowDays);
  if (dateKey < today || dateKey > lastBookableDate) return [];
  const unavailableRanges = busyRanges
    .map((range) => ({ start: new Date(range.startsAt).getTime(), end: new Date(range.endsAt).getTime() }))
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.start < range.end);
  const leadBoundary = now.getTime() + leadMinutes * 60 * 1000;

  return windowsForDate({ dateKey, weeklySessions, exception }).flatMap(({ start, end }) => {
    const result = [];
    const sessionStart = minutesFor(start);
    const sessionEnd = minutesFor(end);
    for (let cursor = sessionStart; cursor + durationMinutes <= sessionEnd; cursor += intervalMinutes) {
      const startTime = timeFor(cursor);
      const startsAt = istInstant(dateKey, startTime);
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
      const bufferedStart = startsAt.getTime() - bufferBeforeMinutes * 60 * 1000;
      const bufferedEnd = endsAt.getTime() + bufferAfterMinutes * 60 * 1000;
      if (startsAt.getTime() < leadBoundary) continue;
      if (unavailableRanges.some((range) => overlaps(bufferedStart, bufferedEnd, range.start, range.end))) continue;
      result.push({
        slotId: makeSlotId(doctorId, dateKey, startTime),
        startsAt,
        endsAt,
        dateKey,
        time: startTime,
      });
    }
    return result;
  });
};

module.exports = { buildAvailability, makeSlotId, minutesFor, validSessions, windowsForDate };
