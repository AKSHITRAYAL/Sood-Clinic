import { describe, expect, it } from 'vitest';

import { CONSENT_VERSION, validateBookingInput } from '../../lib/engine/bookingInput.js';

const now = new Date('2026-10-15T06:00:00.000Z'); // 11:30 IST on 2026-10-15

const visitType = {
  id: 'consultation',
  intakeQuestions: [
    { id: 'notes', label: 'Anything we should know?', type: 'text', required: false, options: [] },
  ],
};

const requiredVisitType = {
  id: 'consultation',
  intakeQuestions: [
    { id: 'first_visit', label: 'Is this your first visit?', type: 'select', required: true, options: ['yes', 'no'] },
    { id: 'notes', label: 'Anything we should know?', type: 'text', required: false, options: [] },
  ],
};

const input = (overrides = {}) => ({
  doctorId: 'dr-sood',
  visitTypeId: 'consultation',
  startsAt: '2026-10-18T03:30:00.000Z',
  clientRequestId: 'client-request-abcdefgh',
  patient: { name: 'Test Patient', phone: '+919000000001' },
  consent: { version: CONSENT_VERSION },
  ...overrides,
});

const validate = (overrides = {}, type = visitType) => validateBookingInput(input(overrides), type, { now });

describe('validateBookingInput', () => {
  it('accepts a minimal valid booking and normalises the fields', () => {
    const result = validate({ patient: { name: '  Test   Patient ', phone: ' +91 90000 00001 ', email: 'Test.Patient@Example.COM' } });
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({
      name: 'Test Patient',
      phone: '+91 90000 00001',
      phoneKey: '+919000000001',
      email: 'Test.Patient@Example.COM',
      emailLower: 'test.patient@example.com',
      dob: null,
      ageYears: null,
      sex: null,
      visitKind: 'new',
      reason: null,
      intake: {},
    });
  });

  it('rejects a missing or too short name', () => {
    expect(validate({ patient: { phone: '+919000000001' } })).toMatchObject({ ok: false, reason: 'VALIDATION', fields: { name: expect.any(String) } });
    expect(validate({ patient: { name: ' A ', phone: '+919000000001' } }).ok).toBe(false);
  });

  it('rejects a name longer than 120 characters', () => {
    const result = validate({ patient: { name: 'A'.repeat(121), phone: '+919000000001' } });
    expect(result.ok).toBe(false);
    expect(result.fields.name).toBeDefined();
  });

  it('accepts a 120 character name at the boundary', () => {
    expect(validate({ patient: { name: 'A'.repeat(120), phone: '+919000000001' } }).ok).toBe(true);
  });

  it('rejects a phone that is not a valid Indian mobile number', () => {
    const result = validate({ patient: { name: 'Test Patient', phone: '12345' } });
    expect(result).toMatchObject({ ok: false, reason: 'INVALID_PHONE' });
    expect(result.fields.phone).toBeDefined();
  });

  it('reports the phone reason ahead of other field errors', () => {
    expect(validate({ patient: { name: 'A', phone: 'nope', email: 'not-an-email' } }).reason).toBe('INVALID_PHONE');
  });

  it('rejects an invalid email', () => {
    expect(validate({ patient: { name: 'Test Patient', phone: '+919000000001', email: 'test@example' } }))
      .toMatchObject({ ok: false, reason: 'INVALID_EMAIL' });
  });

  it('rejects an email longer than 254 characters', () => {
    const long = `${'a'.repeat(250)}@example.com`;
    expect(validate({ patient: { name: 'Test Patient', phone: '+919000000001', email: long } }).fields.email).toBeDefined();
  });

  it('rejects a date of birth in the future', () => {
    expect(validate({ patient: { name: 'Test Patient', phone: '+919000000001', dob: '2027-01-01' } }).fields.dob).toBeDefined();
  });

  it('rejects a date of birth that is not a real calendar date', () => {
    expect(validate({ patient: { name: 'Test Patient', phone: '+919000000001', dob: '2026-02-30' } }).fields.dob).toBeDefined();
  });

  it('accepts a date of birth of today in IST', () => {
    expect(validate({ patient: { name: 'Test Patient', phone: '+919000000001', dob: '2026-10-15' } }).ok).toBe(true);
  });

  it('rejects a sex outside the enum', () => {
    expect(validate({ patient: { name: 'Test Patient', phone: '+919000000001', sex: 'prefer_not_to_say' } }).fields.sex).toBeDefined();
  });

  it('accepts each documented sex value', () => {
    ['female', 'male', 'other'].forEach((sex) => {
      expect(validate({ patient: { name: 'Test Patient', phone: '+919000000001', sex } }).value.sex).toBe(sex);
    });
  });

  it('rejects an age outside 0–120 or a fractional age', () => {
    ['-1', '121', '4.5'].forEach((ageYears) => {
      expect(validate({ patient: { name: 'Test Patient', phone: '+919000000001', ageYears } }).fields.ageYears).toBeDefined();
    });
  });

  it('rejects a reason longer than 500 characters', () => {
    expect(validate({ reason: 'x'.repeat(501) }).fields.reason).toBeDefined();
    expect(validate({ reason: 'x'.repeat(500) }).ok).toBe(true);
  });

  it('requires every required intake question to be answered', () => {
    const result = validate({ intake: { notes: 'Follow-up on last week' } }, requiredVisitType);
    expect(result.ok).toBe(false);
    expect(result.fields['intake.first_visit']).toBeDefined();
  });

  it('accepts the required intake question and keeps only answered questions', () => {
    const result = validate({ intake: { first_visit: 'yes', notes: '' } }, requiredVisitType);
    expect(result.ok).toBe(true);
    expect(result.value.intake).toEqual({ first_visit: 'yes' });
  });

  it('rejects an intake answer longer than 500 characters', () => {
    expect(validate({ intake: { notes: 'x'.repeat(501) } }).fields['intake.notes']).toBeDefined();
  });

  it('rejects intake answers for questions the visit type does not ask', () => {
    expect(validate({ intake: { unknown_question: 'x' } }).fields.intake).toBeDefined();
  });

  it('rejects intake that is not a plain object', () => {
    expect(validate({ intake: ['first_visit=yes'] }).fields.intake).toBeDefined();
  });

  it('rejects a consent version mismatch', () => {
    expect(validate({ consent: { version: 'booking-v0' } })).toMatchObject({ ok: false, reason: 'CONSENT_REQUIRED' });
    expect(validate({ consent: undefined }).reason).toBe('CONSENT_REQUIRED');
  });

  it('refuses the interim top-level consentVersion string (§6.6 sends consent:{version})', () => {
    expect(validate({ consent: undefined, consentVersion: CONSENT_VERSION })).toMatchObject({ ok: false, reason: 'CONSENT_REQUIRED' });
  });

  it('rejects a visit kind outside the enum', () => {
    expect(validate({ patient: { name: 'Test Patient', phone: '+919000000001', visitKind: 'walk_in' } }).fields.visitKind).toBeDefined();
  });

  it('never returns server-side secrets or unrecognised keys', () => {
    const result = validate({ intake: { notes: 'Acidity since Monday' }, reason: 'Acidity' });
    expect(result.ok).toBe(true);
    expect(Object.keys(result.value).sort()).toEqual([
      'ageYears', 'dob', 'email', 'emailLower', 'intake', 'name', 'phone', 'phoneKey', 'reason', 'sex', 'visitKind',
    ]);
    expect(JSON.stringify(result.value)).not.toMatch(/tokenHash|manageToken|token/i);
  });

  it('validates against a visit type with no intake questions', () => {
    expect(validate({}, { id: 'consultation', intakeQuestions: [] }).value.intake).toEqual({});
  });
});
