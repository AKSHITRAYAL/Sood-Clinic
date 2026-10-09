const STAFF_ROLES = Object.freeze(['admin', 'doctor', 'receptionist']);

const isStaffRole = (value) => STAFF_ROLES.includes(value);
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isDoctorId = (value) => /^[A-Za-z0-9_-]{2,80}$/.test(String(value || ''));

// Firebase Authentication has its own password policy. This local gate provides a
// conservative baseline for administrator-created temporary credentials.
const isStrongTemporaryPassword = (value) => {
  const password = String(value || '');
  return password.length >= 12 && /[A-Za-z]/.test(password) && /\d/.test(password);
};

const staffClaims = ({ existingClaims = {}, role, doctorId, forcePasswordChange = false }) => {
  const claims = { ...existingClaims, role, forcePasswordChange: Boolean(forcePasswordChange) };
  if (role === 'doctor') claims.doctorId = doctorId;
  else delete claims.doctorId;
  return claims;
};

module.exports = { STAFF_ROLES, isDoctorId, isEmail, isStaffRole, isStrongTemporaryPassword, normalizeEmail, staffClaims };
