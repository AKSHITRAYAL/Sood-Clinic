// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
const { listeners, captured } = vi.hoisted(() => ({ listeners: [], captured: { day: [], weekly: [], special: [] } }));
vi.mock('../lib/firebase', () => ({ functions: {}, auth: {}, firebaseApp: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => vi.fn() }));
vi.mock('firebase/auth', () => ({ onAuthStateChanged: (_auth, callback) => { listeners.push(callback); return () => {}; } }));
vi.mock('../components/SqlClinicDay', () => ({ default: props => { captured.day.push(props); return null; } }));
vi.mock('../components/SqlWeeklyHours', () => ({ default: props => { captured.weekly.push(props); return null; } }));
vi.mock('../components/SqlSpecialHours', () => ({ default: props => { captured.special.push(props); return null; } }));
import SqlStaffSchedule from './SqlStaffSchedule';

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
const repoRoot = async () => (await sourceRoot()).replace(/\/?Frontend\/src$/, '');
const signingIn = async user => { await act(async () => { await listeners.at(-1)(user); }); };
const claimsUser = (uid, claims) => ({ uid, getIdTokenResult: vi.fn(async () => ({ claims })) });
const lastProps = () => [captured.day.at(-1), captured.weekly.at(-1), captured.special.at(-1)];
afterEach(() => { cleanup(); listeners.length = 0; captured.day.length = 0; captured.weekly.length = 0; captured.special.length = 0; });

test('the five schedule exports use the frozen callable options and their own backends', async () => {
  const source = await readFile(`${await repoRoot()}/functions/index.js`, 'utf8');
  const names = ['listSqlStaffClinicDay', 'getSqlDoctorWeeklyHours', 'saveSqlDoctorWeeklyHours', 'getSqlDoctorSpecialHours', 'saveSqlDoctorSpecialHours'];
  for (const name of names) {
    expect(source).toMatch(new RegExp(`exports\\.${name} = onCall\\(sqlPatientCallableOptions, request => createSql\\w+Backend\\(`));
    expect(source).not.toMatch(new RegExp(`exports\\.${name} = [^\\n]*\\bcallableOptions\\b`));
  }
  const scheduleExports = [...source.matchAll(/^exports\.(listSqlStaffClinicDay|getSqlDoctor\w+|saveSqlDoctor\w+) =/gm)].map(match => match[1]);
  expect(scheduleExports.sort()).toEqual([...names].sort());
});

test('the page composes the trio with an empty scope until auth settles', () => {
  render(<SqlStaffSchedule />);
  expect(lastProps()).toEqual([
    { accountUid: '', role: '', assignedDoctorId: '' },
    { accountUid: '', role: '', assignedDoctorId: '' },
    { accountUid: '', role: '', assignedDoctorId: '' },
  ]);
  for (const props of lastProps()) expect(Object.keys(props).sort()).toEqual(['accountUid', 'assignedDoctorId', 'role']);
});

test('claims decide the role and doctor scope for all three panels', async () => {
  render(<SqlStaffSchedule />);
  const user = claimsUser('synthetic-doctor-uid', { role: 'doctor', doctorId: 'DOC-71' });
  await signingIn(user);
  expect(user.getIdTokenResult).toHaveBeenCalledTimes(1);
  for (const props of lastProps()) expect(props).toEqual({ accountUid: 'synthetic-doctor-uid', role: 'doctor', assignedDoctorId: 'DOC-71' });
});

test('a manager and a claim-less account are passed through with an empty doctor scope', async () => {
  render(<SqlStaffSchedule />);
  await signingIn(claimsUser('synthetic-manager', { role: 'manager' }));
  for (const props of lastProps()) expect(props).toEqual({ accountUid: 'synthetic-manager', role: 'manager', assignedDoctorId: '' });
  await signingIn(claimsUser('synthetic-unscoped', {}));
  for (const props of lastProps()) expect(props).toEqual({ accountUid: 'synthetic-unscoped', role: '', assignedDoctorId: '' });
  await signingIn(null);
  for (const props of lastProps()) expect(props).toEqual({ accountUid: '', role: '', assignedDoctorId: '' });
});

test('an account change remounts the panels with the new scope', async () => {
  render(<SqlStaffSchedule />);
  await signingIn(claimsUser('synthetic-first', { role: 'admin' }));
  await signingIn(claimsUser('synthetic-second', { role: 'doctor', doctorId: 'DOC-72' }));
  for (const props of lastProps()) expect(props).toEqual({ accountUid: 'synthetic-second', role: 'doctor', assignedDoctorId: 'DOC-72' });
  expect(captured.day).toHaveLength(3);
});

test('the staged page stays out of the router graph and never reads Firestore', async () => {
  const root = await sourceRoot();
  const entries = await Promise.all(['public', 'staff'].map(name => readFile(`${root}/entry/${name}.jsx`, 'utf8')));
  entries.push(await readFile(`${root}/main.jsx`, 'utf8'));
  expect(entries.join('\n')).not.toContain('SqlStaffSchedule');
  const source = await readFile(`${root}/pages/SqlStaffSchedule.jsx`, 'utf8');
  expect(source).not.toMatch(/firebase\/firestore|localStorage|sessionStorage/);
});
