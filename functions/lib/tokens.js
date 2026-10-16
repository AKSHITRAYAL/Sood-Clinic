const crypto = require('node:crypto');

const newManageToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

const tokensEqual = (hashA, hashB) => {
  if (typeof hashA !== 'string' || typeof hashB !== 'string' || hashA.length !== hashB.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hashA), Buffer.from(hashB));
};

module.exports = { hashToken, newManageToken, tokensEqual };
