import { describe, expect, it } from 'vitest';
import { validateVisitType } from '../../lib/engine/visitType.js';

const question = { id: 'q1', label: 'Reason for visit', type: 'text', required: false, options: [] };

const valid = {
  label: 'General consultation',
  slug: 'general-consultation',
  mode: 'in_person',
  minutes: 20,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 10,
  minNoticeMinutes: 30,
  maxAdvanceDays: 30,
  intervalMinutes: 20,
  dailyLimit: null,
  requiresConfirmation: false,
  color: 'blue',
  doctorIds: [],
  intakeQuestions: [],
  pricePaise: null,
  active: true,
  sortOrder: 1,
};

const rejects = (patch, key) => {
  const result = validateVisitType({ ...valid, ...patch });
  expect(result.ok, `${key} should be rejected`).toBe(false);
  expect(result.errors).toHaveProperty(key);
};

describe('visit type validation', () => {
  it('accepts the canonical shape', () => {
    expect(validateVisitType(valid)).toEqual({ ok: true, errors: {} });
  });

  it('accepts every documented boundary value', () => {
    expect(validateVisitType({ ...valid, label: 'x'.repeat(80) }).ok).toBe(true);
    expect(validateVisitType({ ...valid, slug: 'ab' }).ok).toBe(true);
    expect(validateVisitType({ ...valid, minutes: 5, intervalMinutes: 5 }).ok).toBe(true);
    expect(validateVisitType({ ...valid, minutes: 240, intervalMinutes: 240 }).ok).toBe(true);
    expect(validateVisitType({ ...valid, bufferBeforeMinutes: 0, bufferAfterMinutes: 120 }).ok).toBe(true);
    expect(validateVisitType({ ...valid, minNoticeMinutes: 0 }).ok).toBe(true);
    expect(validateVisitType({ ...valid, minNoticeMinutes: 10080 }).ok).toBe(true);
    expect(validateVisitType({ ...valid, maxAdvanceDays: 1 }).ok).toBe(true);
    expect(validateVisitType({ ...valid, maxAdvanceDays: 180 }).ok).toBe(true);
    expect(validateVisitType({ ...valid, dailyLimit: 1 }).ok).toBe(true);
    expect(validateVisitType({ ...valid, pricePaise: 0 }).ok).toBe(true);
    expect(validateVisitType({ ...valid, intakeQuestions: Array.from({ length: 8 }, () => ({ ...question })) }).ok).toBe(true);
    expect(validateVisitType({ ...valid, doctorIds: ['doctor-one'] }).ok).toBe(true);
  });

  it('rejects every documented bound', () => {
    rejects({ label: '' }, 'label');
    rejects({ label: 'x'.repeat(81) }, 'label');
    rejects({ slug: 'a' }, 'slug');
    rejects({ slug: 'Bad slug' }, 'slug');
    rejects({ mode: 'online' }, 'mode');
    rejects({ minutes: 0 }, 'minutes');
    rejects({ minutes: 7 }, 'minutes');
    rejects({ minutes: 245 }, 'minutes');
    rejects({ bufferBeforeMinutes: 7 }, 'bufferBeforeMinutes');
    rejects({ bufferBeforeMinutes: 125 }, 'bufferBeforeMinutes');
    rejects({ bufferAfterMinutes: 7 }, 'bufferAfterMinutes');
    rejects({ bufferAfterMinutes: 125 }, 'bufferAfterMinutes');
    rejects({ intervalMinutes: 7 }, 'intervalMinutes');
    rejects({ intervalMinutes: 245 }, 'intervalMinutes');
    rejects({ minNoticeMinutes: -5 }, 'minNoticeMinutes');
    rejects({ minNoticeMinutes: 10081 }, 'minNoticeMinutes');
    rejects({ maxAdvanceDays: 0 }, 'maxAdvanceDays');
    rejects({ maxAdvanceDays: 181 }, 'maxAdvanceDays');
    rejects({ dailyLimit: 0 }, 'dailyLimit');
    rejects({ color: 'red' }, 'color');
    rejects({ sortOrder: -1 }, 'sortOrder');
    rejects({ doctorIds: ['doctor-one', 42] }, 'doctorIds');
    rejects({ pricePaise: -1 }, 'pricePaise');
    rejects({ requiresConfirmation: 'yes' }, 'requiresConfirmation');
    rejects({ active: 'yes' }, 'active');
    rejects({ intakeQuestions: Array.from({ length: 9 }, () => ({ ...question })) }, 'intakeQuestions');
    rejects({ intakeQuestions: [{ ...question, id: '' }] }, 'intakeQuestions.0.id');
    rejects({ intakeQuestions: [{ ...question, label: 'x'.repeat(201) }] }, 'intakeQuestions.0.label');
    rejects({ intakeQuestions: [{ ...question, type: 'number' }] }, 'intakeQuestions.0.type');
    rejects({ intakeQuestions: [{ ...question, required: undefined }] }, 'intakeQuestions.0.required');
    rejects({ intakeQuestions: [{ ...question, options: 'none' }] }, 'intakeQuestions.0.options');
  });
});
