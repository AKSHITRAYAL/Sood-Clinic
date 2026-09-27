const fs = require('fs');
const path = require('path');

function loadEnvFile() {
  const file = path.resolve(__dirname, '../../.env');
  if (!fs.existsSync(file)) return;
  fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  });
}

loadEnvFile();
const isProduction = process.env.NODE_ENV === 'production';
if (isProduction && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
  throw new Error('JWT_SECRET must be at least 32 characters in production.');
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  isProduction,
  port: Number(process.env.PORT || 3001),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/careflow_clinic',
  jwtSecret: process.env.JWT_SECRET || 'development-only-secret-change-before-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  corsOrigin: process.env.CORS_ORIGIN || 'http://127.0.0.1:5174',
};
