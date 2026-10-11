import { describe, expect, it } from 'vitest';
import phone from '../lib/phone.js';

const { toE164 } = phone;

describe('Indian phone normalisation', () => {
  it('normalises a valid international number', () => {
    expect(toE164('+91 98765 43210')).toBe('+919876543210');
  });

  it('normalises a valid domestic number', () => {
    expect(toE164('098765 43210')).toBe('+919876543210');
  });

  it('rejects an invalid number', () => {
    expect(toE164('123')).toBeNull();
  });
});
