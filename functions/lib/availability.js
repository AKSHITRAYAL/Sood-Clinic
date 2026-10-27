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
 * P0-02 pure availability engine for the clinic booking callable.
 *
 * Turns recurring weekly sessions, one per-date exception (`closed | extra |
 * replace`), the visit duration/interval and lead/buffer windows into an ordered
 * list of bookable slots, then removes anything outside the booking window, anything
 * in the past for the given `now`, and anything covered by a busy range (booked/
 * blocked/held Firestore slot locks or external calendar busy periods).
 *
 * All caller-supplied busy values are absolute instants; weekly sessions and
 * exceptions remain local IST wall-clock values.
 *
 * Contract:
 *  - Returns slots only within [today, today + bookingWindowDays] in IST.
 *  - `closed` returns no slots for that date.
 *  - `replace` ignores recurring sessions for that date.
 *  - `extra` keeps recurring sessions and adds the exception sessions.
 *  - Overlapping sessions are merged implicitly by the per-session slot loop.
 *  - Slot times are the engine's canonical `timeFor(minutes)` values, so the slot
 *    id from `makeSlotId(doctorId, dateKey, time)` and the `{time}` returned to
 *    callers are identical.
 *  - `now` is the engine's IST-aware wall clock for lead-time and future-only slot
 *    filtering; pass a fixed value when testing IST boundary cases.
 *  - Slot generation uses half-open IST intervals: a slot with `startsAt` exactly at
 *    the end of a session is never produced because the loop enforces
 *    `cursor + durationMinutes <= sessionEnd`.
 *  - Busy ranges are normalized to finite start/end pairs before overlap checks so
 *    malformed busy locks cannot remove every slot on a day.
 *  - Buffer windows are applied around each slot before overlap checks, so a booked
 *    slot removes surrounding buffer space as well as the booked interval.
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
    .map((range) => {
      const start = new Date(range.startsAt).getTime();
      const end = new Date(range.endsAt).getTime();
      return Number.isFinite(start) && Number.isFinite(end) && start < end ? { start, end } : null;
    })
    .filter(Boolean);
  const leadBoundary = now.getTime() + leadMinutes * 60 * 1000;

  return windowsForDate({ dateKey, weeklySessions, exception }).flatMap(({ start, end }) => {
    const result = [];
    const sessionStart = minutesFor(start);
    const sessionEnd = minutesFor(end);
    if (!Number.isFinite(sessionStart) || !Number.isFinite(sessionEnd) || sessionStart >= sessionEnd) return result;
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
