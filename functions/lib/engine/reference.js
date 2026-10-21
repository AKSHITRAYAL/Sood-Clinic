const crypto = require('node:crypto');

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

const newReference = (randomInt = crypto.randomInt) => {
  let value = 'SC-';
  for (let index = 0; index < 8; index += 1) value += ALPHABET[randomInt(ALPHABET.length)];
  return value;
};

module.exports = { ALPHABET, newReference };
