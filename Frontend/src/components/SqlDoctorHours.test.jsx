// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { weekdayIst } from '../lib/ist';
vi.mock('../lib/firebase', () => ({ functions: {}, auth: {}, firebaseApp: {} }));
vi.mock('firebase/data-connect', () => ({ getDataConnect: vi.fn() }));
vi.mock('../../../SQL/generated/clinic/esm/index.esm.js', () => ({ getPublicDoctorHours: vi.fn(), connectorConfig: {} }));
import SqlPublicDoctorHours from './SqlDoctorHours';

const date = '2026-10-20';
const hours = (patch = {}) => ({
  doctorId: 'DOC-71', doctorName: 'Synthetic Doctor', date, timezone: 'Asia/Kolkata',
  kind: 'weekly', windows: [{ startMinute: 540, endMinute: 660 }, { startMinute: 660, endMinute: 720 }], ...patch,
});
const deferred = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };
const submit = async api => {
  render(<SqlPublicDoctorHours doctorId=" DOC-71 " api={api} />);
  fireEvent.change(screen.getByLabelText('Clinic date (IST)'), { target: { value: date } });
  fireEvent.click(screen.getByText('Show clinic hours'));
};
afterEach(cleanup);

test('the component asks for the trimmed doctor, the exact date and the IST weekday', async () => {
  const api = vi.fn(async () => hours());
  await submit(api);
  await screen.findByText('Synthetic Doctor · 2026-10-20');
  expect(api).toHaveBeenCalledWith({ doctorId: 'DOC-71', date, weekday: weekdayIst(date) });
  expect(Object.keys(api.mock.calls[0][0]).sort()).toEqual(['date', 'doctorId', 'weekday']);
  expect(weekdayIst(date)).toBe(2);
});

test('windows render as ordered zero-padded HH:mm pairs in a labelled table', async () => {
  const api = vi.fn(async () => hours());
  await submit(api);
  await screen.findByText('Published weekly hours');
  expect([...document.querySelectorAll('tbody tr')].map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent))).toEqual([
    ['09:00', '11:00'], ['11:00', '12:00'],
  ]);
  expect(screen.getByText('Clinic hours (IST)')).toBeTruthy();
  expect(screen.getByText(/appointments, patient details and private schedule notes are never part of this view/)).toBeTruthy();
});

test('each exception kind gets its own label and a closed day is explicit', async () => {
  for (const [kind, label] of [['extra', 'Extra hours added for this date'], ['replace', 'Hours replaced for this date'], ['closed', 'Closed on this date']]) {
    const api = vi.fn(async () => hours({ kind, windows: kind === 'closed' ? [] : [{ startMinute: 600, endMinute: 660 }] }));
    await submit(api);
    await screen.findByText(label);
    if (kind === 'closed') {
      expect(screen.getByText('The clinic is closed on this date.')).toBeTruthy();
      expect(document.querySelectorAll('tbody tr')).toHaveLength(0);
    } else {
      expect(document.querySelectorAll('tbody tr')).toHaveLength(1);
    }
    cleanup();
  }
});

test('a date without windows says so instead of implying the clinic is closed', async () => {
  const api = vi.fn(async () => hours({ kind: 'weekly', windows: [] }));
  await submit(api);
  await screen.findByText('No published windows are recorded for this date.');
  expect(screen.queryByText('The clinic is closed on this date.')).toBeNull();
  expect(document.querySelectorAll('tbody tr')).toHaveLength(0);
});

test('a provider failure shows fail-closed copy and never a partial window table', async () => {
  const api = vi.fn(async () => { throw new Error('synthetic provider failure'); });
  await submit(api);
  await screen.findByText('Clinic hours are unavailable for that doctor and date. Check the details and retry.');
  expect(document.querySelector('table')).toBeNull();
  expect(screen.queryByText('Published weekly hours')).toBeNull();
});

test('the busy guard blocks duplicate loads and an empty doctor id never reaches the provider', async () => {
  const pending = deferred();
  const api = vi.fn(() => pending.promise);
  render(<SqlPublicDoctorHours api={api} />);
  fireEvent.change(screen.getByLabelText('Clinic date (IST)'), { target: { value: date } });
  const form = document.querySelector('form');
  expect(screen.getByText('Show clinic hours').closest('button').disabled).toBe(true);
  fireEvent.submit(form);
  expect(api).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Doctor ID'), { target: { value: 'DOC-71' } });
  fireEvent.submit(form);
  fireEvent.submit(form);
  await screen.findByText('Loading…');
  expect(api).toHaveBeenCalledTimes(1);
  pending.resolve(hours());
  await screen.findByText('Published weekly hours');
  expect(api).toHaveBeenCalledTimes(1);
});

test('an unmounted view drops a late response', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const pending = deferred();
  const api = vi.fn(() => pending.promise);
  render(<SqlPublicDoctorHours doctorId="DOC-71" api={api} />);
  fireEvent.change(screen.getByLabelText('Clinic date (IST)'), { target: { value: date } });
  fireEvent.click(screen.getByText('Show clinic hours'));
  await screen.findByText('Loading…');
  cleanup();
  pending.resolve(hours());
  await new Promise(resolve => setTimeout(resolve, 0));
  pending.reject(new Error('synthetic late failure'));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(consoleError).not.toHaveBeenCalled();
  expect(document.querySelector('table')).toBeNull();
  consoleError.mockRestore();
});

// jsdom rewrites import.meta.url to an http URL, so locate the sources from disk.
const sourceRoot = async () => {
  let dir = globalThis.process.cwd();
  for (let depth = 0; depth < 5; depth += 1) {
    for (const prefix of ['Frontend/src', 'src']) {
      try { await readFile(`${dir}/${prefix}/entry/staff.jsx`); return `${dir}/${prefix}`; } catch { /* keep looking */ }
    }
    dir = `${dir}/..`;
  }
  throw new Error('Frontend sources were not found from the working directory.');
};

test('the staged page is absent from every router and entry import graph', async () => {
  const root = await sourceRoot();
  const entries = await Promise.all(['public', 'staff'].map(name => readFile(`${root}/entry/${name}.jsx`, 'utf8')));
  entries.push(await readFile(`${root}/main.jsx`, 'utf8'));
  const routers = entries.join('\n');
  for (const page of ['SqlPublicDoctorHoursPage', 'SqlStaffSchedule', 'SqlPatientPortal', 'SqlStaffPatients']) {
    expect(routers).not.toContain(page);
  }
  expect(routers).toContain('<Route');
});
