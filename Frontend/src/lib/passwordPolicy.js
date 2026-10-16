export const passwordPolicyMessage = 'Use at least 8 characters with an uppercase letter, lowercase letter, number, and special character.';

export const passwordRequirements = (value) => {
  const password = String(value || '');
  return {
    minimumLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^\p{L}\p{N}\s]/u.test(password),
  };
};

export const hasStrongPassword = (value) => Object.values(passwordRequirements(value)).every(Boolean);
