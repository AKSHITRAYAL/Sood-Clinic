import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const { createSqlSchedulerAvailability, sqlSchedulerAvailabilityStore } = require('../lib/sqlSchedulerAvailability');
const { istInstant, weekdayIst } = require('../lib/ist');

// B027: the unmounted Phase 6 SQL read adapter, exercised with an injected store and
// clock only. Fixtures mirror what ReadDoctorUnitRange returns: one doctor row with
// minute windows plus the day's unit rows.
const LEGACY_ID = 'brig-ak-sood';
const DOCTOR_UUID = '7f1c2f44-9f3a-4d0b-8b8e-2f6a5c1d3e21';
const DATE = '2026-10-26';
const NOW = new Date('2026-10-26T02:00:00.000Z'); // 07:30 IST, before the session opens
const WEEKDAY = weekdayIst(DATE);
const visitType = { minutes: 20, intervalMinutes: 20, minNoticeMinutes: 0, maxAdvanceDays: 180 };
const weeklySlots = ['09:00', '09:20', '09:40', '10:00', '10:20', '10:40', '11:00', '11:20', '11:40'];
const sha = (value) => createHash('sha256').update(value).digest('hex');
const unitKey = (time) => `${LEGACY_ID}_${DATE.replace(/-/g, '')}${time.replace(':', '')}`;
const at = (time) => istInstant(DATE, time).toISOString();

const doctor = (overrides = {}) => ({
  id: DOCTOR_UUID,
  legacyId: LEGACY_ID,
  active: true,
  branch: { timezone: 'Asia/Kolkata' },
  state: { authority: 'doctor_schedule' },
  sessions: [{ weekday: WEEKDAY, startMinute: 9 * 60, endMinute: 12 * 60 }],
  exceptions: [],
  blocks: [],
  units: [],
  ...overrides,
});
const source = (overrides = {}) => ({ user: { active: true }, doctors: [doctor(overrides)] });
const hold = ({ time = '10:00', hash = sha('other-hold-token'), expiresAt = '2026-10-26T02:10:00.000Z' }) => ({
  unitKey: unitKey(time), unitAt: at(time), kind: 'hold', holdHash: hash, expiresAt,
});
const appointment = (time) => ({ unitKey: unitKey(time), unitAt: at(time), kind: 'appointment' });

const read = (result, { ownHoldHash = '', visit = visitType, dateKey = DATE, now = NOW, store } = {}) => createSqlSchedulerAvailability({
  store: store || { read: async () => result },
  now: () => now,
}).getDay({ actorUid: 'uid-admin', doctorLegacyId: LEGACY_ID, dateKey, visitType: visit, ownHoldHash });
const times = async (result, options) => (await read(result, options)).slots.map((slot) => slot.time);

test('reads one active IST doctor-schedule authority and offers its weekly windows', async () => {
  const day = await read(source());
  expect(day).toMatchObject({ dateKey: DATE, timezone: 'Asia/Kolkata' });
  expect(day.slots.map((slot) => slot.time)).toEqual(weeklySlots);
  expect(day.slots[0].startsAt.toISOString()).toBe('2026-10-26T03:30:00.000Z');
});

test('asks the store for exactly the documented read variables', async () => {
  const calls = [];
  const store = { read: async (args) => { calls.push(args); return source(); } };
  await read(source(), { store });
  expect(calls).toHaveLength(1);
  expect(Object.keys(calls[0]).sort()).toEqual(['actorUid', 'dateKey', 'doctorLegacyId', 'rangeEnd', 'rangeStart']);
  expect(calls[0]).toMatchObject({
    actorUid: 'uid-admin',
    doctorLegacyId: LEGACY_ID,
    dateKey: DATE,
    rangeStart: istInstant(DATE).toISOString(),
    rangeEnd: new Date(istInstant(DATE).getTime() + 24 * 60 * 60 * 1000).toISOString(),
  });
});

test('converts minute windows and gives extra/replace/closed exceptions precedence', async () => {
  const extra = { date: DATE, kind: 'extra', windows: [{ startMinute: 13 * 60, endMinute: 14 * 60 }] };
  const replace = { date: DATE, kind: 'replace', windows: [{ startMinute: 13 * 60, endMinute: 14 * 60 }] };
  const closed = { date: DATE, kind: 'closed', windows: [] };
  expect(await times(source({ exceptions: [extra] }))).toEqual([...weeklySlots, '13:00', '13:20', '13:40']);
  expect(await times(source({ exceptions: [replace] }))).toEqual(['13:00', '13:20', '13:40']);
  expect(await times(source({ exceptions: [closed] }))).toEqual([]);
});

test('keeps appointment units occupied and ignores only holds that have really expired', async () => {
  const units = [appointment('10:00'), hold({ time: '11:00', expiresAt: '2026-10-26T01:59:59.000Z' })];
  expect(await times(source({ units }))).toEqual(weeklySlots.filter((time) => time !== '10:00'));
  // A hold expiring exactly at `now` is still occupied: the conservative boundary.
  const boundary = [hold({ time: '11:00', expiresAt: NOW.toISOString() })];
  expect(await times(source({ units: boundary }))).toEqual(weeklySlots.filter((time) => time !== '11:00'));
});

test('only the matching hold hash sees its own live hold as free', async () => {
  const own = sha('hold-token-for-this-browser');
  const units = [hold({ time: '10:00', hash: own })];
  expect(await times(source({ units }))).toEqual(weeklySlots.filter((time) => time !== '10:00'));
  expect(await times(source({ units }), { ownHoldHash: own })).toEqual(weeklySlots);
  expect(await times(source({ units }), { ownHoldHash: sha('a-different-visitor') })).toEqual(weeklySlots.filter((time) => time !== '10:00'));
});

test('blocks slots that overlap a SQL calendar block', async () => {
  const blocks = [{ startsAt: at('10:00'), endsAt: at('10:20') }];
  expect(await times(source({ blocks }))).toEqual(weeklySlots.filter((time) => time !== '10:00'));
});

test('refuses a daily-limit visit type instead of guessing a count', async () => {
  await expect(read(source(), { visit: { ...visitType, dailyLimit: 4 } })).rejects.toMatchObject({ code: 'failed-precondition' });
});

test('rejects unusable doctor rows, windows, units and exceptions', async () => {
  const cases = {
    'inactive account': { user: { active: false } },
    'no doctor row': { doctors: [] },
    'ambiguous doctor rows': { doctors: [doctor(), doctor()] },
    'inactive doctor': { doctors: [doctor({ active: false })] },
    'foreign legacy id': { doctors: [doctor({ legacyId: 'someone-else' })] },
    'non-IST branch': { doctors: [doctor({ branch: { timezone: 'Asia/Dubai' } })] },
    'unreviewed schedule authority': { doctors: [doctor({ state: null })] },
    'bad doctor id': { doctors: [doctor({ id: 'not-a-uuid' })] },
    '16 weekly sessions': { doctors: [doctor({ sessions: Array.from({ length: 16 }, () => ({ weekday: WEEKDAY, startMinute: 540, endMinute: 600 })) })] },
    'inverted window': { doctors: [doctor({ sessions: [{ weekday: WEEKDAY, startMinute: 720, endMinute: 540 }] })] },
    'out-of-range minute': { doctors: [doctor({ sessions: [{ weekday: WEEKDAY, startMinute: 540, endMinute: 24 * 60 }] })] },
    'overlapping windows': { doctors: [doctor({ sessions: [{ weekday: WEEKDAY, startMinute: 540, endMinute: 660 }, { weekday: WEEKDAY, startMinute: 600, endMinute: 720 }] })] },
    'unordered weekdays': { doctors: [doctor({ sessions: [{ weekday: 6, startMinute: 540, endMinute: 600 }, { weekday: 5, startMinute: 540, endMinute: 600 }] })] },
    'exception for another date': { doctors: [doctor({ exceptions: [{ date: '2026-10-27', kind: 'closed', windows: [] }] })] },
    'closed day with windows': { doctors: [doctor({ exceptions: [{ date: DATE, kind: 'closed', windows: [{ startMinute: 540, endMinute: 600 }] }] })] },
    'unknown exception kind': { doctors: [doctor({ exceptions: [{ date: DATE, kind: 'holiday', windows: [] }] })] },
    'two exceptions': { doctors: [doctor({ exceptions: [{ date: DATE, kind: 'closed', windows: [] }, { date: DATE, kind: 'closed', windows: [] }] })] },
    'inverted block': { doctors: [doctor({ blocks: [{ startsAt: at('10:20'), endsAt: at('10:00') }] })] },
    'unparseable block': { doctors: [doctor({ blocks: [{ startsAt: 'not-a-time', endsAt: at('10:00') }] })] },
    'duplicate unit': { doctors: [doctor({ units: [appointment('10:00'), appointment('10:00')] })] },
    'unknown unit kind': { doctors: [doctor({ units: [{ unitKey: unitKey('10:00'), unitAt: at('10:00'), kind: 'tentative' }] })] },
    'hold without a hash': { doctors: [doctor({ units: [{ unitKey: unitKey('10:00'), unitAt: at('10:00'), kind: 'hold', expiresAt: at('11:00') }] })] },
    'hold without an expiry': { doctors: [doctor({ units: [{ unitKey: unitKey('10:00'), unitAt: at('10:00'), kind: 'hold', holdHash: sha('x') }] })] },
    'malformed unit timestamp': { doctors: [doctor({ units: [{ unitKey: unitKey('10:00'), unitAt: 'not-a-time', kind: 'appointment' }] })] },
  };
  for (const [name, result] of Object.entries(cases)) {
    await expect(read(result), name).rejects.toMatchObject({ code: 'failed-precondition' });
  }
});

test('rejects malformed request inputs before reading', async () => {
  const store = { read: async () => { throw new Error('should not read'); } };
  await expect(read(source(), { store, dateKey: '2026-02-31' })).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(read(source(), { store, ownHoldHash: 'not-a-hash' })).rejects.toMatchObject({ code: 'failed-precondition' });
  await expect(read(source(), { store, now: new Date('nope') })).rejects.toThrow('Scheduler clock must return a valid Date.');
  expect(() => createSqlSchedulerAvailability({})).toThrow('A scheduler SQL read store is required.');
});

test('the generated-store adapter maps only the five documented variables', async () => {
  const generatedPath = require.resolve('../generated/sql');
  const calls = [];
  const previous = require.cache[generatedPath];
  require.cache[generatedPath] = {
    id: generatedPath,
    filename: generatedPath,
    loaded: true,
    exports: { readDoctorUnitRange: async (dc, args) => { calls.push({ dc, args }); return { data: { user: { active: true }, doctors: [doctor()] } }; } },
  };
  try {
    const dc = { marker: 'dc' };
    const day = await sqlSchedulerAvailabilityStore(dc).read({ actorUid: 'uid-admin', doctorLegacyId: LEGACY_ID, dateKey: DATE, rangeStart: 'a', rangeEnd: 'b' });
    expect(day.doctors).toHaveLength(1);
    expect(calls).toEqual([{ dc, args: { actorUid: 'uid-admin', doctorLegacyId: LEGACY_ID, exceptionDate: DATE, rangeStart: 'a', rangeEnd: 'b' } }]);
  } finally {
    if (previous) require.cache[generatedPath] = previous;
    else delete require.cache[generatedPath];
  }
});
