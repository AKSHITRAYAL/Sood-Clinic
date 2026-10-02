const isTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || '');

const legacyPairToSession = (window) => {
  if (!Array.isArray(window) || window.length !== 2 || !isTime(window[0]) || !isTime(window[1])) return null;
  return { start: window[0], end: window[1] };
};

export const normalizeSessions = (sessions) => (Array.isArray(sessions) ? sessions : [])
  .map((session) => {
    if (Array.isArray(session)) return legacyPairToSession(session);
    if (!session || !isTime(session.start) || !isTime(session.end)) return null;
    return { start: session.start, end: session.end, ...(Number.isInteger(session.weekday) ? { weekday: session.weekday } : {}) };
  })
  .filter((session) => session && session.start < session.end);

export const normalizeSchedule = (data) => {
  if (!data) return [];
  if (Array.isArray(data.sessions)) return normalizeSessions(data.sessions).filter((session) => Number.isInteger(session.weekday));
  return Object.entries(data.weekly || {}).flatMap(([weekday, rule]) => {
    if (!rule?.enabled) return [];
    return normalizeSessions(rule.windows).map((session) => ({ ...session, weekday: Number(weekday) }));
  });
};

export const normalizeException = (data) => {
  if (!data) return null;
  if (Array.isArray(data.sessions)) return { type: data.type, sessions: normalizeSessions(data.sessions) };
  return { type: data.status === 'unavailable' ? 'closed' : 'extra', sessions: normalizeSessions(data.windows) };
};

export const sessionsForWeekday = (sessions, weekday) => normalizeSessions(sessions)
  .filter((session) => session.weekday === weekday)
  .map(({ start, end }) => ({ start, end }));

export const sessionsFromWeekly = (weekly) => Object.entries(weekly || {}).flatMap(([weekday, rule]) => {
  if (!rule?.enabled) return [];
  return normalizeSessions(rule.windows).map(({ start, end }) => ({ weekday: Number(weekday), start, end }));
});

export const weeklyFromSessions = (sessions, defaults) => {
  const weekly = Object.fromEntries(Object.entries(defaults).map(([weekday, rule]) => [weekday, { ...rule, windows: [] }]));
  normalizeSessions(sessions).forEach(({ weekday, start, end }) => {
    if (!Number.isInteger(weekday) || !weekly[weekday]) return;
    weekly[weekday] = { enabled: true, windows: [...weekly[weekday].windows, [start, end]] };
  });
  return weekly;
};
