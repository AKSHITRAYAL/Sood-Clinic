// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const api = vi.hoisted(() => ({ list: vi.fn(), own: vi.fn(), submit: vi.fn(), withdraw: vi.fn(), interact: vi.fn(), user: null }));
vi.mock('../lib/firebase', () => ({ auth: {} }));
vi.mock('firebase/auth', () => ({ onAuthStateChanged: (_a, cb) => { cb(api.user); return () => {}; } }));
vi.mock('../components/Navbar', () => ({ default: () => <nav>Navigation</nav> }));
vi.mock('../components/Footer', () => ({ default: () => <footer>Footer</footer> }));
vi.mock('../services/reviewService', () => ({ listReviews: api.list, myReviews: api.own, submitReview: api.submit, withdrawReview: api.withdraw, interactWithReview: api.interact }));
import Reviews from './Reviews';
const row = { id: 'one', rating: 1, comment: 'The waiting time needs improvement.', authorLabel: 'Verified patient', verifiedVisit: true, publishedAt: '2026-11-01T05:00:00Z', helpfulCount: 0 };
const result = { reviews: [row], featured: [], nextCursor: null, summary: { count: 1, average: 1, distribution: { 1: 1, 2: 0, 3: 0, 4: 0, 5: 0 } } };
beforeEach(() => { vi.clearAllMocks(); api.user = null; api.list.mockResolvedValue(result); });
afterEach(cleanup);
test('shows low-rating reviews with compact filters', async () => {
  render(<MemoryRouter><Reviews /></MemoryRouter>);
  await screen.findByText(row.comment); expect(screen.getByRole('heading', { name: 'Patient reviews' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Previous Testimonials' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Recent reviews' })).toBeTruthy();
  expect(screen.getByText('An extremely humble, polite, and professional doctor.', { exact: false })).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'lowest' } });
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ sort: 'lowest', rating: 0 })));
  fireEvent.change(screen.getByLabelText('Rating'), { target: { value: '1' } });
  await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ rating: 1 })));
  expect(screen.getByRole('heading', { name: 'Write a review' })).toBeTruthy();
});
test('shows load failures with retry instead of pretending there are no reviews', async () => {
  api.list.mockRejectedValueOnce(new Error('Reviews unavailable'));
  render(<MemoryRouter><Reviews /></MemoryRouter>); await screen.findByText('Reviews unavailable');
  fireEvent.click(screen.getByText('Try again')); await screen.findByText(row.comment);
});
test('submits a public review by default for an owned completed visit', async () => {
  api.user = { getIdTokenResult: async () => ({ claims: {} }) };
  api.own.mockResolvedValue({ reviews: [], nextCursor: null, visits: [{ id: 'completed-visit', at: '2026-11-01T05:00:00Z' }] });
  api.submit.mockResolvedValue({ message: 'Awaiting moderation.' });
  render(<MemoryRouter initialEntries={['/reviews?appointment=completed-visit']}><Reviews /></MemoryRouter>);
  await screen.findByLabelText('Completed visit');
  const submit = screen.getByText('Send feedback');
  const consent = screen.getByRole('checkbox'); expect(consent.checked).toBe(true);
  fireEvent.click(screen.getByRole('radio', { name: '4 stars' })); fireEvent.change(screen.getByLabelText(/Your experience/), { target: { value: 'The clinic explained the next steps clearly.' } });
  fireEvent.click(submit);
  await waitFor(() => expect(api.submit).toHaveBeenCalledWith({ appointmentId: 'completed-visit', rating: 4, comment: 'The clinic explained the next steps clearly.', publicConsent: true }));
});

test('lets a guest submit feedback with an optional reference and booking contact', async () => {
  api.submit.mockResolvedValue({ message: 'Awaiting moderation.' });
  render(<MemoryRouter><Reviews /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Write a review' });
  fireEvent.change(screen.getByLabelText(/Appointment reference/), { target: { value: 'SC-ABC123' } });
  fireEvent.change(screen.getByLabelText(/Phone used for booking/), { target: { value: '9877853935' } });
  fireEvent.click(screen.getByRole('radio', { name: '5 stars' }));
  fireEvent.change(screen.getByLabelText(/Your experience/), { target: { value: 'The clinic explained the next steps clearly.' } });
  fireEvent.click(screen.getByText('Send feedback'));
  await waitFor(() => expect(api.submit).toHaveBeenCalledWith(expect.objectContaining({ appointmentReference: 'SC-ABC123', contactPhone: '9877853935', rating: 5, publicConsent: true })));
});

test('lets a guest submit with email only', async () => {
  const submitted = { ...row, id: 'submitted-review', rating: 5, comment: 'The clinic explained the next steps clearly.', authorLabel: 'Patient feedback', verifiedVisit: false };
  api.list.mockResolvedValueOnce({ ...result, reviews: [] }).mockResolvedValueOnce({ ...result, reviews: [submitted] });
  api.submit.mockResolvedValue({ message: 'Thank you. Your review is now public.' });
  render(<MemoryRouter><Reviews /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Write a review' });
  fireEvent.change(screen.getByLabelText(/Email used for booking/), { target: { value: 'patient@example.com' } });
  fireEvent.click(screen.getByRole('radio', { name: '5 stars' }));
  fireEvent.change(screen.getByLabelText(/Your experience/), { target: { value: 'The clinic explained the next steps clearly.' } });
  fireEvent.click(screen.getByText('Send feedback'));
  await waitFor(() => expect(api.submit).toHaveBeenCalledWith(expect.objectContaining({ contactPhone: '', contactEmail: 'patient@example.com', rating: 5, publicConsent: true })));
  await screen.findByText(submitted.comment);
  expect(screen.getByRole('status').textContent).toContain('Your review is now public.');
  expect(api.list).toHaveBeenCalledTimes(2);
});

test('explains that a guest needs one contact method', async () => {
  render(<MemoryRouter><Reviews /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Write a review' });
  fireEvent.click(screen.getByRole('radio', { name: '5 stars' }));
  fireEvent.change(screen.getByLabelText(/Your experience/), { target: { value: 'The clinic explained the next steps clearly.' } });
  fireEvent.click(screen.getByText('Send feedback'));
  expect((await screen.findByRole('status')).textContent).toContain('Enter a phone number or email address for follow-up.');
  expect(api.submit).not.toHaveBeenCalled();
});
