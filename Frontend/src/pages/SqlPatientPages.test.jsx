// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
const { listeners, captured } = vi.hoisted(() => ({ listeners: [], captured: { module: [], staff: [] } }));
vi.mock('../lib/firebase', () => ({ functions: {}, auth: {}, firebaseApp: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => vi.fn() }));
vi.mock('firebase/auth', () => ({ onAuthStateChanged: (_auth, callback) => { listeners.push(callback); return () => {}; } }));
vi.mock('../components/SqlPatientModule', () => ({ default: props => { captured.module.push(props); return null; } }));
vi.mock('../components/SqlStaffPatientWorkspace', () => ({ default: props => { captured.staff.push(props); return null; } }));
import SqlPatientPortal from './SqlPatientPortal';
import SqlStaffPatients from './SqlStaffPatients';
import { sqlPatientService } from '../services/sqlPatientService';
import { sqlPatientSecurityService } from '../services/sqlPatientSecurityService';
import { sqlPatientLinkService } from '../services/sqlPatientLinkService';

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
const signingIn = async user => { await act(async () => { await listeners.at(-1)(user); }); };
const claimsUser = (uid, claims) => ({ uid, getIdTokenResult: vi.fn(async () => ({ claims })) });
afterEach(() => { cleanup(); listeners.length = 0; captured.module.length = 0; captured.staff.length = 0; });

test('the patient portal renders a sign-in gate until an account is present', async () => {
  render(<SqlPatientPortal />);
  expect(screen.getByRole('status').textContent).toBe('Sign in with your patient account to continue.');
  expect(captured.module).toHaveLength(0);
  await signingIn(null);
  expect(screen.getByRole('status').textContent).toBe('Sign in with your patient account to continue.');
  expect(captured.module).toHaveLength(0);
});

test('the patient portal mounts the module with the real service references, never a stub', async () => {
  render(<SqlPatientPortal />);
  await signingIn(claimsUser('synthetic-patient-uid', { role: '' }));
  expect(captured.module).toHaveLength(1);
  expect(captured.module[0].accountUid).toBe('synthetic-patient-uid');
  expect(captured.module[0].patientApi).toBe(sqlPatientService);
  expect(captured.module[0].securityApi).toBe(sqlPatientSecurityService);
  expect(Object.keys(captured.module[0]).sort()).toEqual(['accountUid', 'patientApi', 'securityApi']);
  expect(screen.queryByRole('status')).toBeNull();
});

test('staff role comes from custom claims only and is passed through unchanged', async () => {
  render(<SqlStaffPatients />);
  // Rendered immediately with an empty scope; the workspace denies access itself.
  expect(captured.staff.at(-1)).toMatchObject({ accountUid: '', role: '' });
  await signingIn(claimsUser('synthetic-admin', { role: 'admin' }));
  expect(captured.staff.at(-1)).toMatchObject({ accountUid: 'synthetic-admin', role: 'admin' });
  expect(captured.staff.at(-1).linkApi).toBe(sqlPatientLinkService);
  await signingIn(claimsUser('synthetic-manager', { role: 'manager' }));
  expect(captured.staff.at(-1)).toMatchObject({ accountUid: 'synthetic-manager', role: 'manager' });
  await signingIn(claimsUser('unprivileged', { role: 'patient' }));
  expect(captured.staff.at(-1)).toMatchObject({ accountUid: 'unprivileged', role: 'patient' });
  await signingIn(claimsUser('no-claims', {}));
  expect(captured.staff.at(-1)).toMatchObject({ accountUid: 'no-claims', role: '' });
});

test('an account change re-reads claims and a signed-out session clears the scope', async () => {
  render(<SqlStaffPatients />);
  const first = claimsUser('synthetic-admin', { role: 'admin' });
  await signingIn(first);
  const second = claimsUser('synthetic-doctor', { role: 'doctor', doctorId: 'DOC-71' });
  await signingIn(second);
  expect(first.getIdTokenResult).toHaveBeenCalledTimes(1);
  expect(second.getIdTokenResult).toHaveBeenCalledTimes(1);
  expect(captured.staff.at(-1)).toMatchObject({ accountUid: 'synthetic-doctor', role: 'doctor' });
  await signingIn(null);
  expect(captured.staff.at(-1)).toMatchObject({ accountUid: '', role: '' });
});

test('both staged pages stay out of the router graph and never read Firestore', async () => {
  const root = await sourceRoot();
  const entries = await Promise.all(['public', 'staff'].map(name => readFile(`${root}/entry/${name}.jsx`, 'utf8')));
  entries.push(await readFile(`${root}/main.jsx`, 'utf8'));
  const routers = entries.join('\n');
  for (const page of ['SqlPatientPortal', 'SqlStaffPatients']) expect(routers).not.toContain(page);
  expect(routers).toContain('<Route');
  for (const page of ['SqlPatientPortal', 'SqlStaffPatients']) {
    const source = await readFile(`${root}/pages/${page}.jsx`, 'utf8');
    expect(source).not.toMatch(/firebase\/firestore|localStorage|sessionStorage/);
  }
});
