import { describe, expect, it } from 'vitest';
const { canAttempt, nextRetryAt, notificationState, providerConfig } = require('../lib/notifications');

describe('notification queue policy', () => {
  it('normalises queue state and allows a due attempt', () => {
    expect(notificationState({ attempts: 1 })).toEqual({ status: 'queued', attempts: 1, maxAttempts: 5 });
    expect(canAttempt({ status: 'queued', attempts: 1 })).toBe(true);
  });

  it('stops sent, dead-lettered, exhausted, and future notifications', () => {
    expect(canAttempt({ status: 'sent' })).toBe(false);
    expect(canAttempt({ status: 'dead_letter' })).toBe(false);
    expect(canAttempt({ status: 'queued', attempts: 5 })).toBe(false);
    expect(canAttempt({ status: 'queued', sendAfter: new Date(Date.now() + 60_000) })).toBe(false);
  });

  it('backs off retry timestamps without exposing message content', () => {
    expect(nextRetryAt(1, 1_000).getTime()).toBe(301_000);
    expect(providerConfig({ emailWebhookUrl: 'https://email.example', whatsappWebhookUrl: '' })).toEqual({ email: true, whatsapp: false });
  });
});
