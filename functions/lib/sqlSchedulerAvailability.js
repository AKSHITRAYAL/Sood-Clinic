// Phase 6 SQL scheduler read adapter.  This stays unmounted until the complete
// hold/claim/booking/cancel slice is reviewed; Firestore remains authoritative.
const { HttpsError } = require('firebase-functions/v2/https');
const { computeDaySlots } = require('./engine/availability');
const { istInstant } = require('./ist');

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOLD_HASH = /^[a-f0-9]{64}$/;
const incomplete = () => new HttpsError('failed-precondition', 'The clinic schedule needs review before appointments can be offered.');

const sqlDate = (value) => {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw incomplete();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw incomplete();
  return date;
};

const minuteTime = (value) => {
  if (!Number.isInteger(value) || value < 0 || value >= 24 * 60) throw incomplete();
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
};

const orderedWindows = (rows, withWeekday = false) => {
  let previous = null;
  return rows.map((row) => {
    if (withWeekday && (!Number.isInteger(row?.weekday) || row.weekday < 0 || row.weekday > 6)) throw incomplete();
    const start = minuteTime(row?.startMinute); const end = minuteTime(row?.endMinute);
    if (start >= end) throw incomplete();
    const value = withWeekday ? { weekday: row.weekday, start, end } : { start, end };
    if (previous && (withWeekday ? value.weekday < previous.weekday || (value.weekday === previous.weekday && value.start < previous.end) : value.start < previous.end)) throw incomplete();
    previous = value;
    return value;
  });
};

const exactDoctor = (raw, doctorLegacyId, dateKey, now, ownHoldHash) => {
  if (raw?.user?.active !== true || !Array.isArray(raw?.doctors) || raw.doctors.length !== 1) throw incomplete();
  const doctor = raw.doctors[0];
  if (!UUID.test(doctor?.id || '') || doctor.legacyId !== doctorLegacyId || doctor.active !== true
    || doctor.branch?.timezone !== 'Asia/Kolkata' || doctor.state?.authority !== 'doctor_schedule'
    || !Array.isArray(doctor.sessions) || doctor.sessions.length > 15
    || !Array.isArray(doctor.exceptions) || doctor.exceptions.length > 1
    || !Array.isArray(doctor.blocks) || doctor.blocks.length > 50
    || !Array.isArray(doctor.units) || doctor.units.length > 600) throw incomplete();

  const sessions = orderedWindows(doctor.sessions, true);
  const exception = doctor.exceptions.length ? (() => {
    const row = doctor.exceptions[0];
    if (row?.date !== dateKey || !['closed', 'extra', 'replace'].includes(row.kind)
      || !Array.isArray(row.windows) || row.windows.length > 10) throw incomplete();
    const windows = orderedWindows(row.windows);
    if (row.kind === 'closed' && windows.length) throw incomplete();
    return { type: row.kind, sessions: windows };
  })() : null;

  const blocks = doctor.blocks.map((row) => {
    const startsAt = sqlDate(row?.startsAt); const endsAt = sqlDate(row?.endsAt);
    if (endsAt <= startsAt) throw incomplete();
    return { startsAt, endsAt };
  });
  const unitKeys = new Set();
  const occupiedUnitIds = new Set(doctor.units.map((row) => {
    if (typeof row?.unitKey !== 'string' || !row.unitKey || !['hold', 'appointment'].includes(row.kind)
      || !(sqlDate(row.unitAt) instanceof Date) || unitKeys.has(row.unitKey)) throw incomplete();
    unitKeys.add(row.unitKey);
    if (row.kind === 'hold' && (!HOLD_HASH.test(row.holdHash || '') || row.expiresAt == null)) throw incomplete();
    if (row.kind === 'hold') sqlDate(row.expiresAt);
    return row;
  }).filter((row) => row.kind !== 'hold' || (row.holdHash !== ownHoldHash
    && sqlDate(row.expiresAt).getTime() >= now.getTime()))
    .map((row) => row.unitKey));

  return { sessions, exception, blocks, occupiedUnitIds };
};

function createSqlSchedulerAvailability({ store, now = () => new Date() }) {
  if (!store || typeof store.read !== 'function') throw new Error('A scheduler SQL read store is required.');
  return Object.freeze({
    async getDay({ actorUid, doctorLegacyId, dateKey, visitType, ownHoldHash = '' }) {
      if (typeof actorUid !== 'string' || !actorUid || typeof doctorLegacyId !== 'string' || !doctorLegacyId
        || !DATE_KEY.test(dateKey || '') || (ownHoldHash && !HOLD_HASH.test(ownHoldHash))) throw incomplete();
      try { istInstant(dateKey); } catch { throw incomplete(); }
      // A daily cap cannot safely be inferred from the unit rows alone. Add the
      // explicit appointment-count query before enabling capped visit types.
      if (visitType?.dailyLimit != null) throw incomplete();
      const current = now();
      if (!(current instanceof Date) || Number.isNaN(current.getTime())) throw new Error('Scheduler clock must return a valid Date.');
      const rangeStart = istInstant(dateKey);
      const rangeEnd = new Date(rangeStart.getTime() + 24 * 60 * 60 * 1000);
      const source = await store.read({ actorUid, doctorLegacyId, dateKey, rangeStart: rangeStart.toISOString(), rangeEnd: rangeEnd.toISOString() });
      const { sessions, exception, blocks, occupiedUnitIds } = exactDoctor(source, doctorLegacyId, dateKey, current, ownHoldHash);
      return {
        dateKey,
        timezone: 'Asia/Kolkata',
        slots: computeDaySlots({ dateKey, now: current, doctorId: doctorLegacyId, visitType, weeklySessions: sessions, exception, blocks, occupiedUnitIds }),
      };
    },
  });
}

function sqlSchedulerAvailabilityStore(dc) {
  const { readDoctorUnitRange } = require('../generated/sql');
  return Object.freeze({
    async read({ actorUid, doctorLegacyId, dateKey, rangeStart, rangeEnd }) {
      return (await readDoctorUnitRange(dc, { actorUid, doctorLegacyId, exceptionDate: dateKey, rangeStart, rangeEnd })).data;
    },
  });
}

module.exports = { createSqlSchedulerAvailability, sqlSchedulerAvailabilityStore };
