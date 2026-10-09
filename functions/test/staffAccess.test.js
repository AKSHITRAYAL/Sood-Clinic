import { describe, expect, it } from 'vitest';
import staffAccess from '../lib/staffAccess.js';

const { isDoctorId, isEmail, isStrongTemporaryPassword, normalizeEmail, staffClaims } = staffAccess;

describe('staff access safeguards', () => {
  it('normalizes and validates work email addresses', () => {
    expect(normalizeEmail(' Admin@Clinic.test ')).toBe('admin@clinic.test');
    expect(isEmail('admin@clinic.test')).toBe(true);
    expect(isEmail('not-an-email')).toBe(false);
  });

  it('requires a conservative temporary-password baseline', () => {
    expect(isStrongTemporaryPassword('short1')).toBe(false);
    expect(isStrongTemporaryPassword('longpasswordonly')).toBe(false);
    expect(isStrongTemporaryPassword('12345678901234')).toBe(false);
    expect(isStrongTemporaryPassword('SaferPassword2026')).toBe(true);
  });

  it('keeps doctor scoping only for doctor claims', () => {
    expect(isDoctorId('maharana')).toBe(true);
    expect(isDoctorId('not allowed')).toBe(false);
    expect(staffClaims({ existingClaims: { locale: 'en-IN', doctorId: 'old' }, role: 'receptionist' })).toEqual({ locale: 'en-IN', role: 'receptionist', forcePasswordChange: false });
    expect(staffClaims({ existingClaims: {}, role: 'doctor', doctorId: 'maharana', forcePasswordChange: true })).toEqual({ role: 'doctor', doctorId: 'maharana', forcePasswordChange: true });
  });
});
