const { parsePhoneNumberFromString } = require('libphonenumber-js');

const toE164 = (input) => {
  const phoneNumber = parsePhoneNumberFromString(String(input || '').trim(), 'IN');
  return phoneNumber?.isValid() ? phoneNumber.number : null;
};

module.exports = { toE164 };
