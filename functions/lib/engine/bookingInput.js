const { istDateKey, istInstant } = require('../ist');
const { toE164 } = require('../phone');

// Spec 6.6: the consent version the booking page must send. Accepting an older version
// silently would record agreement to a text the patient was never shown.
const CONSENT_VERSION = 'booking-v1';

const SEXES = Object.freeze(['female', 'male', 'other']);
const VISIT_KINDS = Object.freeze(['new', 'follow_up']);
const MAX_INTAKE_ANSWERS = 8;
const MAX_ANSWER_LENGTH = 500;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/;

const text = (value) => (typeof value === 'string' ? value.trim() : '');

// A well-formed key can still name a day that does not exist (2026-02-30).
const isRealDateKey = (value) => {
  try {
    istInstant(value);
    return true;
  } catch {
    return false;
  }
};

// Pure: the clock is injected, never read from the machine. Errors are reported per field
// so the page can highlight them, with one reason from the A0-07 enum for the error banner.
const validateBookingInput = (input = {}, visitType = {}, { now = new Date() } = {}) => {
  const fields = {};
  const patient = input?.patient || {};

  const name = text(patient.name).replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 120) fields.name = 'Enter a name between 2 and 120 characters.';

  const phone = text(patient.phone);
  const phoneKey = toE164(phone);
  if (!phoneKey) fields.phone = 'Enter a valid Indian mobile number.';

  const email = text(patient.email);
  if (email && (email.length > 254 || !EMAIL_PATTERN.test(email))) fields.email = 'Enter a valid email address.';

  const dob = text(patient.dob);
  if (dob && (!isRealDateKey(dob) || dob < '1900-01-01' || dob > istDateKey(now))) {
    fields.dob = 'Enter a valid date of birth that is not in the future.';
  }

  const sex = text(patient.sex);
  if (sex && !SEXES.includes(sex)) fields.sex = 'Choose one of the listed options.';

  // The booking page asks for an age or a date of birth; the age is optional extra detail.
  const rawAge = patient.ageYears;
  const ageYears = rawAge === undefined || rawAge === null || rawAge === '' ? null : Number(rawAge);
  if (ageYears !== null && (!Number.isInteger(ageYears) || ageYears < 0 || ageYears > 120)) {
    fields.ageYears = 'Enter an age between 0 and 120.';
  }

  const visitKind = text(patient.visitKind) || 'new';
  if (!VISIT_KINDS.includes(visitKind)) fields.visitKind = 'Choose new visit or follow-up.';

  const reason = text(input?.reason);
  if (reason.length > 500) fields.reason = 'Keep the reason under 500 characters.';

  const questions = Array.isArray(visitType?.intakeQuestions) ? visitType.intakeQuestions : [];
  const asked = new Map(questions.map((question) => [String(question?.id || ''), question]));
  const rawIntake = input?.intake === undefined || input?.intake === null ? {} : input.intake;
  const intake = {};
  if (typeof rawIntake !== 'object' || Array.isArray(rawIntake)) {
    fields.intake = 'Refresh the page and answer the visit questions again.';
  } else {
    const keys = Object.keys(rawIntake);
    if (keys.length > MAX_INTAKE_ANSWERS) fields.intake = 'Too many answers were sent for this visit type.';
    keys.forEach((key) => {
      if (!asked.has(key)) {
        fields.intake = 'Refresh the page and answer the visit questions again.';
        return;
      }
      const answer = text(rawIntake[key]);
      if (answer.length > MAX_ANSWER_LENGTH) {
        fields[`intake.${key}`] = 'Keep each answer under 500 characters.';
        return;
      }
      if (answer) intake[key] = answer;
    });
    questions.forEach((question) => {
      if (question?.required === true && !intake[String(question?.id || '')]) {
        fields[`intake.${question.id}`] = 'This question is required.';
      }
    });
  }

  const consentVersion = text(input?.consent?.version) || text(input?.consentVersion);
  if (consentVersion !== CONSENT_VERSION) fields.consent = 'Please accept the consent to continue.';

  const code = fields.phone ? 'INVALID_PHONE'
    : fields.email ? 'INVALID_EMAIL'
      : fields.consent ? 'CONSENT_REQUIRED'
        : Object.keys(fields).length ? 'VALIDATION'
          : null;

  if (code) return { ok: false, reason: code, fields };

  return {
    ok: true,
    value: {
      name,
      phone,
      phoneKey,
      email: email || null,
      emailLower: email ? email.toLowerCase() : null,
      dob: dob || null,
      ageYears,
      sex: sex || null,
      visitKind,
      reason: reason || null,
      intake,
    },
  };
};

module.exports = { CONSENT_VERSION, MAX_INTAKE_ANSWERS, SEXES, VISIT_KINDS, validateBookingInput };
