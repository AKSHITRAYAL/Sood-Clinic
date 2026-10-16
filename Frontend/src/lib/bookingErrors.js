const FRIENDLY_MESSAGES = {
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

export const friendlyBookingError = (error) => {
  const reason = error?.details?.reason || error?.reason;
  return FRIENDLY_MESSAGES[reason] || 'Something went wrong. Please try again or call the clinic.';
};

export { FRIENDLY_MESSAGES };
