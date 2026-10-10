const normalizePatientName = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();

// Keep phone matching independent of display formatting such as spaces, hyphens,
// or a leading plus sign. This value stays server-only in private registry data.
const normalizePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 ? digits : '';
};

const formatUhid = (value) => {
  if (!Number.isInteger(value) || value < 1) throw new Error('UHID sequence must be a positive integer.');
  return `SC-${String(value).padStart(6, '0')}`;
};

const isUhid = (value) => /^SC-\d{6,}$/.test(String(value || ''));

module.exports = { formatUhid, isUhid, normalizePatientName, normalizePhone };
