const { HttpsError } = require('firebase-functions/v2/https');

const schedulerError = (code, reason, message) => new HttpsError(code, message, { reason });

module.exports = { schedulerError };
