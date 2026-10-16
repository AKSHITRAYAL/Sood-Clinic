const { onCall } = require('firebase-functions/v2/https');
const { istDateKey } = require('../../lib/ist');
const { isActiveAppointment } = require('../../lib/appointmentPolicy');
const { computeDaySlots, groupRangesByDate, groupUnitsByDate, monthDateKeys } = require('../../lib/engine/availability');
const { schedulerError } = require('./errors');

const asDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const dateKeyOf = (value) => {
  const date = asDate(value);
  return date ? istDateKey(date) : null;
};

const countActiveByDate = (documents, visitTypeId) => {
  const counts = new Map();
  documents.forEach((document) => {
    if (!isActiveAppointment(document.get('status')) || document.get('visitType') !== visitTypeId) return;
    const dateKey = document.get('dateKey');
    if (dateKey) counts.set(dateKey, (counts.get(dateKey) || 0) + 1);
  });
  return counts;
};

/**
 * Month availability for the public booking calendar (spec 6.2).
 *
 * The day-level callable reads its context per day. A month is 28–31 days, so this one
 * reads each source ONCE for the whole month — schedule, exceptions, blocks, unit locks
 * and, only when the visit type caps a day, that month's appointment counts — and then
 * runs the same pure `computeDaySlots` per day on that shared context. Google free/busy
 * is one request for the month instead of one per day.
 */
const createAvailabilityCallables = ({ db, callableOptions, loadConfig, resolveVisitType, loadExternalBusy }) => {
  const getMonthAvailability = onCall({ ...callableOptions, timeoutSeconds: 60, memory: '256MiB' }, async (request) => {
    const doctorId = String(request.data?.doctorId || '').trim().slice(0, 120);
    const visitTypeId = String(request.data?.visitTypeId || '').trim().slice(0, 120);
    const month = String(request.data?.month || '').trim().slice(0, 7);
    if (!doctorId || !month) throw schedulerError('invalid-argument', 'VALIDATION', 'Choose a doctor and a month.');
    const today = istDateKey();

    const doctorSnapshot = await db.collection('doctors').doc(doctorId).get();
    if (!doctorSnapshot.exists || doctorSnapshot.get('active') !== true || doctorSnapshot.get('bookingEnabled') !== true) {
      throw schedulerError('not-found', 'NOT_FOUND', 'This doctor is not currently available for online bookings.');
    }

    const config = await loadConfig();
    const visitType = await resolveVisitType({ config, visitTypeId });
    const window = monthDateKeys({ month, today, maxAdvanceDays: visitType.maxAdvanceDays });
    // A month nobody can book: malformed, already past, or opening after the booking window.
    if (!window.ok) {
      const message = window.reason === 'VALIDATION' ? 'Choose a valid month.' : 'That month is not open for booking.';
      throw schedulerError('invalid-argument', window.reason, message);
    }
    const { dates } = window;
    const first = dates[0];
    const last = dates[dates.length - 1];
    const inMonth = (value) => value >= first && value <= last;

    const [scheduleSnapshot, exceptionSnapshot, blockSnapshot, unitSnapshot, external] = await Promise.all([
      db.collection('doctorSchedules').doc(doctorId).get(),
      db.collection('scheduleExceptions').where('doctorId', '==', doctorId).where('dateKey', '>=', first).where('dateKey', '<=', last).get(),
      db.collection('calendarBlocks').where('doctorId', '==', doctorId).where('dateKey', '>=', first).where('dateKey', '<=', last).get(),
      db.collection('appointmentSlots').where('doctorId', '==', doctorId).where('dateKey', '>=', first).where('dateKey', '<=', last).get(),
      loadExternalBusy({ doctorId, fromDateKey: first, toDateKey: last }),
    ]);

    const now = new Date();
    const weeklySessions = (scheduleSnapshot.get('sessions') || doctorSnapshot.get('weeklySchedule') || []).map((session) => ({
      weekday: session.weekday,
      start: session.start || session.startTime,
      end: session.end || session.endTime,
    }));
    const exceptionByDate = new Map();
    exceptionSnapshot.docs.forEach((document) => {
      if (inMonth(document.get('dateKey'))) exceptionByDate.set(document.get('dateKey'), document.data());
    });
    const blockRanges = blockSnapshot.docs.map((document) => {
      const block = document.data();
      return { startsAt: asDate(block.startsAt), endsAt: asDate(block.endsAt) };
    }).filter((range) => range.startsAt && range.endsAt)
      .concat(external.ranges.map((range) => ({ startsAt: asDate(range.startsAt), endsAt: asDate(range.endsAt) }))
        .filter((range) => range.startsAt && range.endsAt));
    const blocksByDate = groupRangesByDate(blockRanges, dates);
    // Expired holds are dropped here, so a hold that ran out never hides a slot.
    const occupiedByDate = groupUnitsByDate(unitSnapshot.docs.map((document) => ({
      id: document.id,
      dateKey: document.get('dateKey'),
      kind: document.get('kind') || null,
      expiresAt: asDate(document.get('expiresAt')),
      startsAt: asDate(document.get('startsAt')),
      endsAt: asDate(document.get('endsAt')),
    })), { now, doctorId });

    // Appointment counts are only needed when the visit type caps how many a day takes.
    let activeByDate = new Map();
    if (visitType.dailyLimit !== null) {
      const appointmentSnapshot = await db.collection('appointments')
        .where('doctorId', '==', doctorId)
        .where('dateKey', '>=', first)
        .where('dateKey', '<=', last)
        .get();
      activeByDate = countActiveByDate(appointmentSnapshot.docs, visitType.id);
    }

    const slotsByDate = new Map();
    const days = dates.map((dateKey) => {
      if (dateKey < today) return { dateKey, available: false, slotCount: 0 };
      const slots = computeDaySlots({
        dateKey,
        now,
        doctorId,
        visitType,
        weeklySessions,
        exception: exceptionByDate.get(dateKey) || null,
        blocks: blocksByDate.get(dateKey) || [],
        occupiedUnitIds: occupiedByDate.get(dateKey) || new Set(),
        activeCountForType: activeByDate.get(dateKey) || 0,
      });
      slotsByDate.set(dateKey, slots);
      return { dateKey, available: slots.length > 0, slotCount: slots.length };
    });

    const next = days.find((day) => day.available);
    return {
      timezone: config.timezone,
      month,
      days,
      nextAvailable: next ? { dateKey: next.dateKey, time: slotsByDate.get(next.dateKey)[0].time } : null,
    };
  });

  return { getMonthAvailability };
};

module.exports = { createAvailabilityCallables };
