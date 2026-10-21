import { beforeEach, expect, test, vi } from 'vitest';
const { query, connect, calls } = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn(() => ({ synthetic: 'dc' })), calls: [] }));
vi.mock('firebase/data-connect', () => ({ getDataConnect: connect }));
vi.mock('../../../SQL/generated/clinic/esm/index.esm.js', () => ({ getPublicDoctorHours: query, connectorConfig: { synthetic: true } }));
vi.mock('../lib/firebase', () => ({ firebaseApp: { name: 'synthetic-app' } }));
import { getPublicDoctorHours } from './publicScheduleService';

const date = '2026-10-20';
const unavailable = 'Clinic hours are unavailable.';
const window = (startMinute, endMinute) => ({ startMinute, endMinute });
const doctor = (patch = {}) => ({
  legacyId: 'DOC-71', name: 'Synthetic Doctor', branch: { timezone: 'Asia/Kolkata' },
  state: { authority: 'doctor_schedule' }, weekly: [window(540, 660)], exceptions: [],
  ...patch,
});
const respond = value => { query.mockResolvedValue(value); };
const envelope = patch => ({ data: { doctors: [doctor(patch)] } });
beforeEach(() => { query.mockReset(); connect.mockClear(); calls.length = 0; });

test('a doctor with no exception falls back to the validated weekly windows', async () => {
  respond(envelope({ weekly: [window(540, 660), window(780, 840)] }));
  const result = await getPublicDoctorHours({ doctorId: ' DOC-71 ', date, weekday: 2 });
  expect(connect).toHaveBeenCalledWith({ name: 'synthetic-app' }, { synthetic: true });
  expect(query).toHaveBeenCalledWith({ synthetic: 'dc' }, { doctorLegacyId: 'DOC-71', date, weekday: 2 });
  expect(result).toEqual({ doctorId: 'DOC-71', doctorName: 'Synthetic Doctor', date, timezone: 'Asia/Kolkata', kind: 'weekly', windows: [window(540, 660), window(780, 840)] });
  expect(Object.keys(result).sort()).toEqual(['date', 'doctorId', 'doctorName', 'kind', 'timezone', 'windows']);
  expect(JSON.stringify(result)).not.toMatch(/patient|phone|appointment|private/i);
});

test('extra and replace exceptions take precedence over the weekly windows', async () => {
  respond(envelope({ exceptions: [{ date, kind: 'extra', sessions: [window(1140, 1200)] }] }));
  expect(await getPublicDoctorHours({ doctorId: 'DOC-71', date, weekday: 2 })).toMatchObject({ kind: 'extra', windows: [window(1140, 1200)] });
  respond(envelope({ exceptions: [{ date, kind: 'replace', sessions: [window(600, 720)] }] }));
  expect(await getPublicDoctorHours({ doctorId: 'DOC-71', date, weekday: 2 })).toMatchObject({ kind: 'replace', windows: [window(600, 720)] });
});

test('a closed exception returns an empty window list, never the weekly fallback', async () => {
  respond(envelope({ weekly: [window(540, 660)], exceptions: [{ date, kind: 'closed', sessions: [] }] }));
  expect(await getPublicDoctorHours({ doctorId: 'DOC-71', date, weekday: 2 })).toEqual({
    doctorId: 'DOC-71', doctorName: 'Synthetic Doctor', date, timezone: 'Asia/Kolkata', kind: 'closed', windows: [],
  });
});

test('invalid inputs are refused before any provider call', async () => {
  const inputs = [
    { doctorId: '', date, weekday: 2 },
    { doctorId: '   ', date, weekday: 2 },
    { doctorId: 71, date, weekday: 2 },
    { doctorId: 'DOC-71', date: '2026-10-3', weekday: 2 },
    { doctorId: 'DOC-71', date: 'not-a-date', weekday: 2 },
    { doctorId: 'DOC-71', date, weekday: 7 },
    { doctorId: 'DOC-71', date, weekday: -1 },
    { doctorId: 'DOC-71', date, weekday: 2.5 },
    { doctorId: 'DOC-71', date, weekday: '2' },
  ];
  for (const input of inputs) await expect(getPublicDoctorHours(input)).rejects.toThrow('Choose a valid clinic date and doctor.');
  expect(query).not.toHaveBeenCalled();
});

test('missing, ambiguous or mismatched doctor rows fail closed', async () => {
  for (const data of [
    undefined, {}, { doctors: [] }, { doctors: 'x' },
    { doctors: [doctor(), doctor()] },
    { doctors: [{ ...doctor(), legacyId: 'DOC-72' }] },
    { doctors: [{ ...doctor(), branch: { timezone: 'UTC' } }] },
    { doctors: [{ ...doctor(), branch: null }] },
    { doctors: [{ ...doctor(), state: { authority: 'legacy_schedule' } }] },
    { doctors: [{ ...doctor(), state: null }] },
  ]) {
    respond({ data });
    await expect(getPublicDoctorHours({ doctorId: 'DOC-71', date, weekday: 2 })).rejects.toThrow(unavailable);
  }
});

test('exceptions must be at most one, for the requested date, and of a known kind', async () => {
  for (const exceptions of [
    [{ date, kind: 'extra', sessions: [window(540, 660)] }, { date, kind: 'closed', sessions: [] }],
    [{ date: '2026-10-21', kind: 'extra', sessions: [window(540, 660)] }],
    [{ date, kind: 'invented', sessions: [window(540, 660)] }],
    [{ date, kind: 'extra' }],
    [{ date, kind: 'extra', sessions: 'x' }],
  ]) {
    respond(envelope({ exceptions }));
    await expect(getPublicDoctorHours({ doctorId: 'DOC-71', date, weekday: 2 })).rejects.toThrow(unavailable);
  }
});

test('window rows must be bounded, ordered, non-overlapping and within one day', async () => {
  for (const sessions of [
    [window(540, 660), window(660, 720), window(720, 780), window(780, 840), window(840, 900)],
    [window(660, 720), window(540, 660)],
    [window(540, 720), window(600, 660)],
    [window(540, 540)],
    [window(660, 540)],
    [window(-1, 60)],
    [window(0, 1440)],
    [window(540.5, 660)],
    [window('540', 660)],
    [null],
    'x',
  ]) {
    respond(envelope({ exceptions: [{ date, kind: 'replace', sessions }] }));
    await expect(getPublicDoctorHours({ doctorId: 'DOC-71', date, weekday: 2 })).rejects.toThrow(unavailable);
  }
});

test('touching windows are allowed and adjacent rows survive normalization', async () => {
  respond(envelope({ exceptions: [{ date, kind: 'replace', sessions: [window(540, 660), window(660, 720)] }] }));
  expect((await getPublicDoctorHours({ doctorId: 'DOC-71', date, weekday: 2 })).windows).toEqual([window(540, 660), window(660, 720)]);
});

test('a provider failure surfaces as the same fail-closed error, with no cached or Firestore fallback', async () => {
  query.mockRejectedValue(new Error('synthetic provider offline'));
  await expect(getPublicDoctorHours({ doctorId: 'DOC-71', date, weekday: 2 })).rejects.toThrow('synthetic provider offline');
  // jsdom rewrites import.meta.url to an http URL, so locate the source on disk.
  const fs = await import('node:fs/promises');
  let dir = globalThis.process.cwd();
  let source = '';
  for (let depth = 0; depth < 5 && !source; depth += 1) {
    for (const candidate of [`${dir}/Frontend/src/services/publicScheduleService.js`, `${dir}/src/services/publicScheduleService.js`]) {
      source = await fs.readFile(candidate, 'utf8').catch(() => '');
      if (source) break;
    }
    dir = `${dir}/..`;
  }
  expect(source).toMatch(/getPublicDoctorHours/);
  expect(source).not.toMatch(/firestore|localStorage|sessionStorage/);
});
