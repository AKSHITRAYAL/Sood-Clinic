const { istDateKey, toIstParts } = require('../ist');

const GRID_MINUTES = 5;
const MINUTE_MS = 60 * 1000;

const alignDown = (value) => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('A valid date is required.');
  date.setTime(Math.floor(date.getTime() / (GRID_MINUTES * MINUTE_MS)) * GRID_MINUTES * MINUTE_MS);
  return date;
};

const alignUp = (value) => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('A valid date is required.');
  const size = GRID_MINUTES * MINUTE_MS;
  date.setTime(Math.ceil(date.getTime() / size) * size);
  return date;
};

const istUnitId = (doctorId, date) => {
  if (!doctorId) throw new Error('doctorId is required.');
  const { year, month, day, hour, minute } = toIstParts(date);
  return `${doctorId}_${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}`;
};

const unitSlotsForRange = (doctorId, startsAt, endsAt) => {
  const start = alignDown(startsAt);
  const end = alignUp(endsAt);
  if (end <= start) return [];
  const units = [];
  for (let cursor = start; cursor < end; cursor = new Date(cursor.getTime() + GRID_MINUTES * MINUTE_MS)) {
    units.push({
      id: istUnitId(doctorId, cursor),
      startsAt: cursor,
      endsAt: new Date(cursor.getTime() + GRID_MINUTES * MINUTE_MS),
    });
  }
  return units;
};

const unitIdsForRange = (doctorId, startsAt, endsAt) => unitSlotsForRange(doctorId, startsAt, endsAt).map((unit) => unit.id);

module.exports = { GRID_MINUTES, alignDown, alignUp, istUnitId, unitIdsForRange, unitSlotsForRange, istDateKey };
