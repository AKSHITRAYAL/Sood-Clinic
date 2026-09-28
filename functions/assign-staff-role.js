/*
 * One-time trusted bootstrap for a Firebase Authentication user's staff role.
 * Never commit a service-account key or run this command from a browser.
 *
 * Example:
 * GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/service-account.json" \
 * CLINIC_STAFF_EMAIL="staff@example.com" CLINIC_STAFF_ROLE="admin" \
 * npm run assign-staff-role
 */
const admin = require('firebase-admin');

const email = process.env.CLINIC_STAFF_EMAIL;
const role = process.env.CLINIC_STAFF_ROLE;
const doctorId = process.env.CLINIC_DOCTOR_ID || 'brig-ak-sood';
const allowedRoles = new Set(['admin', 'doctor', 'receptionist']);

if (!email || !allowedRoles.has(role)) {
  console.error('Set CLINIC_STAFF_EMAIL and CLINIC_STAFF_ROLE (admin, doctor, or receptionist).');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.applicationDefault() });

async function assignStaffRole() {
  const user = await admin.auth().getUserByEmail(email.trim().toLowerCase());
  const claims = role === 'doctor' ? { role, doctorId } : { role };
  await admin.auth().setCustomUserClaims(user.uid, claims);
  console.log(`${role} role assigned to ${user.uid}. Sign out and sign in again to refresh the role.`);
}

assignStaffRole().catch((error) => {
  console.error('Could not assign staff role:', error.message);
  process.exitCode = 1;
});
