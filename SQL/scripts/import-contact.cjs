const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { cloudConnector } = require('./cloud.cjs');

async function main() {
  // Existing published website values, not the emulator's fixture seed.
  const published = await import(pathToFileURL(path.resolve(__dirname, '../../Frontend/src/lib/clinicContact.js')));
  const data = {
    name: 'Sood Clinic', phone: published.CLINIC_PHONE_TEL, email: published.CLINIC_EMAIL,
    address: 'House No. 398, Sector 10, Panchkula, Haryana 134109, India', timezone: 'Asia/Kolkata',
  };
  assert.match(data.phone, /^\+[1-9]\d{7,14}$/);
  assert.match(data.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  const query = await cloudConnector('clinic');
  const current = (await query('Query', 'GetPublicClinicContact', undefined, { unauthenticated: true })).clinicProfile;
  if (current) {
    assert.deepEqual(current, data, 'Contact already exists with different values; review the live SQL profile before changing it.');
    console.log('Existing SQL public contact matches; no write needed.');
    return;
  }
  if (!process.argv.includes('--apply')) {
    console.log('Preview: one public clinic contact row will be imported; no patient, user, booking or catalog data. Add --apply to execute.');
    return;
  }
  const admin = await cloudConnector();
  await admin('Mutation', 'ImportPublicClinicContact', data);
  assert.deepEqual((await query('Query', 'GetPublicClinicContact', undefined, { unauthenticated: true })).clinicProfile, data);
  console.log('Published clinic contact imported and verified through anonymous SQL query.');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
