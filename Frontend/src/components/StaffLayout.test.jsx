// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';
const session = vi.hoisted(() => ({ role: 'admin', mustChangePassword: false }));
vi.mock('../lib/staffSessionContext', () => ({ useStaffAccess: () => session }));
vi.mock('../lib/firebase', () => ({ auth: {} }));
vi.mock('firebase/auth', () => ({ signOut: vi.fn() }));
import StaffLayout from './StaffLayout';
afterEach(() => { cleanup(); session.role = 'admin'; session.mustChangePassword = false; });
const mount = path => render(<MemoryRouter initialEntries={[path || '/staff/admin/patients']}><StaffLayout><h1>Workspace content</h1></StaffLayout></MemoryRouter>);
test('shared navigation marks only the correct admin page active and closes the menu on navigation', () => {
  mount(); expect(screen.getByRole('link', { name: 'Patients' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Menu/ })); expect(screen.getByRole('button', { name: /Close menu/ }).getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(screen.getByRole('link', { name: 'Reviews' })); expect(screen.getByRole('button', { name: /Menu/ }).getAttribute('aria-expanded')).toBe('false');
});
test('receptionist gets reviews/account links only and forced-password sessions get no workflow links', () => {
  session.role = 'receptionist'; mount('/staff/reviews');
  expect(screen.queryByRole('link', { name: 'Patients' })).toBeNull(); expect(screen.queryByRole('link', { name: 'Video visits' })).toBeNull(); expect(screen.getByRole('link', { name: 'Reviews' })).toBeTruthy(); cleanup();
  session.mustChangePassword = true; mount('/staff/account');
  expect(screen.queryByRole('link', { name: 'Reviews' })).toBeNull(); expect(screen.getByRole('link', { name: 'My account' })).toBeTruthy(); expect(screen.queryByRole('link', { name: 'Public website' })).toBeNull();
});
test('Escape closes navigation and restores focus to the menu button', () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: /Menu/ })); fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.getByRole('button', { name: /Menu/ })).toBe(document.activeElement);
});
