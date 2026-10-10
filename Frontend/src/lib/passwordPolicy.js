export const passwordPolicyMessage = 'Use at least 12 characters, including a letter and a number.';

export const hasStrongPassword = (value) => {
  const password = String(value || '');
  return password.length >= 12 && /[A-Za-z]/.test(password) && /\d/.test(password);
};
