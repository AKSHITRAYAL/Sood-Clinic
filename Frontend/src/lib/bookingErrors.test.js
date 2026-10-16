import { describe, expect, it } from 'vitest';
import { FRIENDLY_MESSAGES, friendlyBookingError } from './bookingErrors.js';

const EXPECTED = {
  SLOT_TAKEN: 'That time was just booked. Please choose another time.',
  SLOT_UNAVAILABLE: 'That time is no longer available.',
  OUTSIDE_WINDOW: 'That time is no longer available.',
  PAST_TIME: 'That time has already passed.',
  HOLD_EXPIRED: 'Your held time expired. Please choose a time again.',
  INVALID_PHONE: 'Enter a valid Indian mobile number.',
  INVALID_EMAIL: 'Enter a valid email address.',
  CONSENT_REQUIRED: 'Please accept the consent to continue.',
  RATE_LIMITED: 'Too many attempts. Please try again in an hour.',
  PHONE_LIMIT: 'You already have two upcoming appointments. Please call the clinic.',
  NOT_FOUND: 'We could not find this booking.',
  TOKEN_INVALID: 'We could not find this booking.',
  CUTOFF_PASSED: 'This appointment can no longer be changed online. Please call the clinic.',
  INVALID_STATE: 'This appointment cannot be changed in its current state.',
  CONFLICT_NEEDS_OVERRIDE: 'That time conflicts with another booking.',
  FORBIDDEN: 'You do not have permission to do that.',
  VALIDATION: 'Please check the highlighted fields.',
};

describe('friendly booking errors', () => {
  it('uses the exact final copy for every reason', () => {
    expect(FRIENDLY_MESSAGES).toEqual(EXPECTED);
    for (const [reason, message] of Object.entries(EXPECTED)) {
      expect(friendlyBookingError({ details: { reason } }), reason).toBe(message);
    }
  });

  it('maps server reasons without exposing internal details', () => {
    expect(friendlyBookingError({ details: { reason: 'SLOT_TAKEN' } })).toBe('That time was just booked. Please choose another time.');
    expect(friendlyBookingError({ details: { reason: 'UNKNOWN_INTERNAL_CODE' } })).toContain('Something went wrong');
    expect(friendlyBookingError(new Error('boom'))).toContain('Something went wrong');
  });
});
