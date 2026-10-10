import { describe, expect, it } from 'vitest';
import patientRegistry from '../lib/patientRegistry.js';

const { formatUhid, isUhid, normalizePatientName, normalizePhone } = patientRegistry;

describe('patient registry identifiers', () => {
  it('formats monotonic clinic UHIDs without using patient data', () => {
    expect(formatUhid(1)).toBe('SC-000001');
    expect(formatUhid(4827)).toBe('SC-004827');
    expect(isUhid('SC-004827')).toBe(true);
    expect(isUhid('004827')).toBe(false);
  });

  it('normalizes names and phones for exact duplicate checks', () => {
    expect(normalizePatientName('  Priya   Sharma ')).toBe('priya sharma');
    expect(normalizePhone('+91 98765-43210')).toBe('919876543210');
    expect(normalizePhone('invalid')).toBe('');
  });
});
