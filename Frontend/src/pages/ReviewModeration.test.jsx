// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const api = vi.hoisted(() => ({ queue: vi.fn(), detail: vi.fn(), moderate: vi.fn(), role: 'receptionist' }));
vi.mock('../lib/firebase', () => ({ auth: {} }));
vi.mock('firebase/auth', () => ({ signOut: vi.fn() }));
vi.mock('../lib/staffSessionContext', () => ({ useStaffAccess: () => ({ role: api.role, state: 'allowed' }) }));
vi.mock('../services/reviewService', () => ({ moderationQueue: api.queue, moderationDetail: api.detail, moderateReview: api.moderate }));
import ReviewModeration from './ReviewModeration';
const row = { id: 'one', rating: 2, comment: 'We waited longer than expected.', status: 'pending', publicConsent: false, version: 1 };
beforeEach(() => { vi.clearAllMocks(); api.role = 'receptionist'; api.queue.mockResolvedValue({ feedback: [row], nextCursor: null }); api.detail.mockResolvedValue({ reports: [], history: [] }); });
afterEach(cleanup);
test('receptionist sees moderation tools but cannot publish private feedback or feature an unpublished review', async () => {
  render(<MemoryRouter><ReviewModeration /></MemoryRouter>);
  fireEvent.click(await screen.findByText(row.comment));
  expect((await screen.findByText('Publish')).disabled).toBe(true);
  expect(screen.getByText('Save highlight').disabled).toBe(true);
  expect(screen.getByText('Save privacy edit').disabled).toBe(true);
  expect(screen.getByText(/Staff cannot|Private feedback only/)).toBeTruthy();
});
test('submits an audited privacy change with version and reason', async () => {
  api.moderate.mockResolvedValue({ message: 'Review updated.' });
  render(<MemoryRouter><ReviewModeration /></MemoryRouter>); fireEvent.click(await screen.findByText(row.comment));
  fireEvent.change(await screen.findByLabelText('Reason'), { target: { value: 'Remove identifying information' } });
  fireEvent.change(screen.getByLabelText('Privacy-edited public text'), { target: { value: 'The waiting time could improve.' } });
  fireEvent.click(screen.getByText('Save privacy edit'));
  await waitFor(() => expect(api.moderate).toHaveBeenCalledWith({ feedbackId: 'one', version: 1, action: 'redact', reason: 'Remove identifying information', comment: 'The waiting time could improve.' }));
});
test('doctor cannot load moderation data', () => {
  api.role = 'doctor'; render(<MemoryRouter><ReviewModeration /></MemoryRouter>);
  expect(screen.getByText('Review moderation access required')).toBeTruthy(); expect(api.queue).not.toHaveBeenCalled();
});
