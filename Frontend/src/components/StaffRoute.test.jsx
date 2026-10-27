// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
vi.mock('../lib/firebase', () => ({ auth: {}, functions: {} }));
import { StaffRoute } from './StaffAccessProvider';
import { StaffContext } from '../lib/staffSessionContext';

afterEach(cleanup);

const session = (overrides) => ({ status: 'allowed', user: { uid: 'staff-1' }, role: 'doctor', mustChangePassword: false, refresh: () => {}, ...overrides });

const renderGuard = (staffSession, role) => render(
  <StaffContext.Provider value={staffSession}>
    <MemoryRouter initialEntries={['/staff/video']}>
      <Routes>
        <Route element={<StaffRoute role={role} />}>
          <Route path="/staff/video" element={<p>protected workspace</p>} />
        </Route>
        <Route path="/staff/login" element={<p>staff sign-in</p>} />
        <Route path="/staff/account" element={<p>password change</p>} />
      </Routes>
    </MemoryRouter>
  </StaffContext.Provider>,
);

// The page-level copies of these checks were removed from VideoConsultations; the route
// guard is now the only place that decides, so every branch is pinned here.
test('a signed-out session is sent to the staff sign-in page', () => {
  renderGuard(session({ status: 'signed-out', user: null, role: undefined }));
  expect(screen.getByText('staff sign-in')).toBeTruthy();
});

test('a pending verification shows a status instead of the workspace', () => {
  renderGuard(session({ status: 'checking', user: undefined, role: undefined }));
  expect(screen.getByRole('status').textContent).toBe('Verifying staff access…');
});

test('a forced password change is sent to the account page', () => {
  renderGuard(session({ mustChangePassword: true }));
  expect(screen.getByText('password change')).toBeTruthy();
});

test('a role mismatch is denied by default', () => {
  renderGuard(session({ role: 'doctor' }), 'admin');
  expect(screen.getByText('Access required')).toBeTruthy();
  expect(screen.queryByText('protected workspace')).toBeNull();
});

test('a matching staff role sees the workspace', () => {
  renderGuard(session({ role: 'doctor' }), 'doctor');
  expect(screen.getByText('protected workspace')).toBeTruthy();
});
