const RETRY_DELAYS_MS = Object.freeze([60_000, 5 * 60_000, 30 * 60_000, 2 * 60 * 60_000]);

const nextRetryAt = (attempts, now = Date.now()) => {
  const index = Math.max(0, Math.min(Number(attempts) || 0, RETRY_DELAYS_MS.length - 1));
  return new Date(now + RETRY_DELAYS_MS[index]);
};

const notificationState = (data = {}) => ({
  status: data.status || 'queued',
  attempts: Number.isInteger(data.attempts) ? data.attempts : 0,
  maxAttempts: Number.isInteger(data.maxAttempts) ? data.maxAttempts : 5,
});

const canAttempt = (data, now = Date.now()) => {
  const state = notificationState(data);
  if (state.status === 'sent' || state.status === 'dead_letter') return false;
  if (state.attempts >= state.maxAttempts) return false;
  const sendAfter = data.sendAfter?.toDate ? data.sendAfter.toDate().getTime() : new Date(data.sendAfter || 0).getTime();
  return !Number.isFinite(sendAfter) || sendAfter <= now;
};

const providerConfig = ({ emailWebhookUrl = '', whatsappWebhookUrl = '' } = {}) => ({
  email: Boolean(emailWebhookUrl),
  whatsapp: Boolean(whatsappWebhookUrl),
});

module.exports = { RETRY_DELAYS_MS, canAttempt, nextRetryAt, notificationState, providerConfig };
