// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
vi.mock('../lib/firebase', () => ({ functions: {}, auth: {}, firebaseApp: {} }));
vi.mock('firebase/functions', () => ({ httpsCallable: () => vi.fn() }));
import SqlAuditLog from './SqlAuditLog';

const at = n => `2026-10-20T04:${String(n).padStart(2, '0')}:00.000000Z`;
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = (n, patch = {}) => ({
  id: id(n), at: at(n), action: 'patient_searched', actorRole: 'admin',
  actorUid: 'synthetic-admin-uid', resourceType: 'patient', resourceId: 'SYNTHETIC-UHID', ...patch,
});
const page = (patch = {}) => ({ events: [row(2), row(1)], nextCursor: null, ...patch });
const deferred = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };
afterEach(cleanup);

test('only a current administrator mounts the table', () => {
  const api = { list: vi.fn() };
  for (const props of [
    { accountUid: '', role: 'admin' },
    { accountUid: 'u1', role: 'manager' },
    { accountUid: 'u1', role: 'doctor' },
    { accountUid: 'u1', role: '' },
  ]) {
    render(<SqlAuditLog {...props} api={api} />);
    expect(screen.getByRole('alert').textContent).toBe('Current administrator access is required.');
    cleanup();
  }
  render(<SqlAuditLog accountUid="u1" role="admin" api={api} />);
  expect(screen.getByRole('heading', { name: 'Activity' })).toBeTruthy();
  expect(api.list).not.toHaveBeenCalled();
});

test('loading renders the operational columns only and never a metadata column', async () => {
  const api = { list: vi.fn(async () => page()) };
  render(<SqlAuditLog accountUid="u1" role="admin" api={api} />);
  fireEvent.click(screen.getByText('Load activity'));
  await screen.findAllByText('patient searched');
  expect(api.list).toHaveBeenCalledWith(null);
  expect([...document.querySelectorAll('thead th')].map(cell => cell.textContent)).toEqual(['When', 'Action', 'Actor', 'Resource']);
  expect(document.querySelectorAll('tbody tr')).toHaveLength(2);
  expect(document.querySelector('tbody tr td:nth-child(3) small').textContent).toBe('syntheti');
  expect(screen.queryByText(/metadata|search term/i)).toBeTruthy();
  expect(screen.getByText('Refresh from the start')).toBeTruthy();
  expect(screen.queryByText('Load older activity')).toBeNull();
});

test('an account event without an actor still renders and an empty log is explicit', async () => {
  const api = { list: vi.fn(async () => page({ events: [row(1, { actorUid: null })] })) };
  render(<SqlAuditLog accountUid="u1" role="admin" api={api} />);
  fireEvent.click(screen.getByText('Load activity'));
  await screen.findAllByText('patient searched');
  expect(document.querySelectorAll('tbody tr')).toHaveLength(1);
  expect(document.querySelector('tbody tr td:nth-child(3)').textContent).toBe('admin');

  cleanup();
  const empty = { list: vi.fn(async () => ({ events: [], nextCursor: null })) };
  render(<SqlAuditLog accountUid="u1" role="admin" api={empty} />);
  fireEvent.click(screen.getByText('Load activity'));
  await screen.findByText('No activity is recorded yet.');
});

test('older pages append once, deduplicate a tie row and stop at the end cursor', async () => {
  const api = { list: vi.fn()
    .mockResolvedValueOnce(page({ events: [row(3)], nextCursor: { occurredAt: at(3) } }))
    .mockResolvedValueOnce({ events: [row(3), row(3, { id: id(9) }), row(2)], nextCursor: null }) };
  render(<SqlAuditLog accountUid="u1" role="admin" api={api} />);
  fireEvent.click(screen.getByText('Load activity'));
  await screen.findAllByText('patient searched');
  fireEvent.click(screen.getByText('Load older activity'));
  await waitFor(() => expect(document.querySelectorAll('tbody tr')).toHaveLength(3));
  expect(api.list).toHaveBeenLastCalledWith({ occurredAt: at(3) });
  expect(document.querySelectorAll('tbody tr')[1].textContent).toContain('SYNTHETIC-UHID');
  expect(screen.queryByText('Load older activity')).toBeNull();
});

test('a repeated cursor page is refused instead of looping on the same window', async () => {
  const cursor = { occurredAt: at(2) };
  const api = { list: vi.fn(async () => ({ events: [row(2)], nextCursor: cursor })) };
  render(<SqlAuditLog accountUid="u1" role="admin" api={api} />);
  fireEvent.click(screen.getByText('Load activity'));
  await screen.findAllByText('patient searched');
  fireEvent.click(screen.getByText('Load older activity'));
  await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByText('Load older activity'));
  await screen.findByText('That activity page was already requested. Refresh from the start.');
  expect(api.list).toHaveBeenCalledTimes(2);
});

test('a permission failure shows the fail-closed copy and a refresh starts clean', async () => {
  const api = { list: vi.fn()
    .mockResolvedValueOnce(page())
    .mockRejectedValueOnce(Object.assign(new Error('synthetic'), { code: 'functions/permission-denied' }))
    .mockResolvedValueOnce(page({ events: [row(5)], nextCursor: null })) };
  render(<SqlAuditLog accountUid="u1" role="admin" api={api} />);
  fireEvent.click(screen.getByText('Load activity'));
  await screen.findAllByText('patient searched');
  fireEvent.click(screen.getByText('Refresh from the start'));
  await screen.findByText('Activity is unavailable. Verify current administrator access, then retry.');
  fireEvent.click(screen.getByText('Load activity'));
  await screen.findAllByText('patient searched');
  await waitFor(() => expect(document.querySelectorAll('tbody tr')).toHaveLength(1));
});

test('an unmounted view ignores a late page', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const pending = deferred();
  const api = { list: vi.fn(() => pending.promise) };
  const view = render(<SqlAuditLog accountUid="u1" role="admin" api={api} />);
  fireEvent.click(screen.getByText('Load activity'));
  await screen.findByText('Loading…');
  view.unmount();
  pending.resolve(page());
  await new Promise(resolve => setTimeout(resolve, 0));
  pending.reject(new Error('synthetic offline'));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(consoleError).not.toHaveBeenCalled();
  consoleError.mockRestore();
});
