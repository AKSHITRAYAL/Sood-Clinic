export const IST_TIME_ZONE = 'Asia/Kolkata';

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: IST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const parseDateKey = (dateKey) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) throw new Error('dateKey must use YYYY-MM-DD.');
  const [year, month, day] = match.slice(1).map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) throw new Error('dateKey is not a real calendar date.');
  return { year, month, day };
};

const parseTime = (time) => {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new Error('time must use HH:mm.');
  return { hour: Number(match[1]), minute: Number(match[2]) };
};

export const toIstParts = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('A valid date is required.');
  const parts = Object.fromEntries(dateFormatter.formatToParts(date)
    .filter((part) => part.type !== 'literal')
    .map((part) => [part.type, Number(part.value)]));
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
};

export const istDateKey = (value = new Date()) => {
  const { year, month, day } = toIstParts(value);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

export const istInstant = (dateKey, time = '00:00') => {
  const { year, month, day } = parseDateKey(dateKey);
  const { hour, minute } = parseTime(time);
  return new Date(Date.UTC(year, month - 1, day, hour, minute) - (5 * 60 + 30) * 60 * 1000);
};

export const weekdayIst = (dateKey) => {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

export const addIstDays = (dateKey, days) => {
  const { year, month, day } = parseDateKey(dateKey);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
};

export const startOfIstWeekMonday = (value = new Date()) => {
  const dateKey = istDateKey(value);
  const daysSinceMonday = (weekdayIst(dateKey) + 6) % 7;
  return istInstant(addIstDays(dateKey, -daysSinceMonday));
};
