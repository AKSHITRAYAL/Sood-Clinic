const crypto = require('crypto');

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_API = 'https://www.googleapis.com/calendar/v3';

const encode = (value) => Buffer.from(value).toString('base64url');

const encryptionKey = (secret) => crypto.createHash('sha256').update(String(secret || '')).digest();
const encrypt = (value, secret) => {
  if (!secret) throw new Error('Calendar token encryption has not been configured.');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return `${encode(iv)}.${encode(ciphertext)}.${encode(cipher.getAuthTag())}`;
};
const decrypt = (payload, secret) => {
  const [iv, ciphertext, tag] = String(payload || '').split('.').map((part) => Buffer.from(part, 'base64url'));
  if (!iv || !ciphertext || !tag || !secret) throw new Error('Calendar connection cannot be decrypted.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
};

const requestJson = async (url, options = {}) => {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error('Google Calendar request failed.');
    error.status = response.status;
    error.code = body.error?.status || body.error || 'GOOGLE_CALENDAR_ERROR';
    throw error;
  }
  return body;
};

const buildAuthorizationUrl = ({ clientId, redirectUri, state }) => {
  if (!clientId || !redirectUri || !state) throw new Error('Google Calendar OAuth is not configured.');
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${query}`;
};

const exchangeAuthorizationCode = async ({ code, clientId, clientSecret, redirectUri }) => requestJson(GOOGLE_TOKEN_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
});

const refreshAccessToken = async ({ refreshToken, clientId, clientSecret }) => requestJson(GOOGLE_TOKEN_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' }),
});

const freeBusy = async ({ accessToken, calendarId, timeMin, timeMax }) => {
  const result = await requestJson(`${GOOGLE_API}/freeBusy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeMin, timeMax, items: [{ id: calendarId || 'primary' }] }),
  });
  return (result.calendars?.[calendarId || 'primary']?.busy || []).map((item) => ({ startsAt: item.start, endsAt: item.end }));
};

const createEvent = async ({ accessToken, calendarId, startsAt, endsAt, appointmentReference }) => requestJson(`${GOOGLE_API}/calendars/${encodeURIComponent(calendarId || 'primary')}/events`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  // Never put patient name, phone, reason, or other PHI into an external calendar event.
  body: JSON.stringify({ summary: `Sood Clinic appointment ${appointmentReference}`, start: { dateTime: startsAt, timeZone: 'Asia/Kolkata' }, end: { dateTime: endsAt, timeZone: 'Asia/Kolkata' }, extendedProperties: { private: { appointmentReference } } }),
});

const updateEventTime = async ({ accessToken, calendarId, eventId, startsAt, endsAt }) => requestJson(`${GOOGLE_API}/calendars/${encodeURIComponent(calendarId || 'primary')}/events/${encodeURIComponent(eventId)}`, {
  method: 'PATCH',
  headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  // The external calendar remains intentionally free of patient information.
  body: JSON.stringify({ start: { dateTime: startsAt, timeZone: 'Asia/Kolkata' }, end: { dateTime: endsAt, timeZone: 'Asia/Kolkata' } }),
});

module.exports = { buildAuthorizationUrl, createEvent, decrypt, encrypt, exchangeAuthorizationCode, freeBusy, refreshAccessToken, updateEventTime };
