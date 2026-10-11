/*
 * One-time, local migration for the former front-desk role.
 *
 * Preview first (the default):
 *   GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/service-account.json" \
 *   npm run migrate-manager-role
 *
 * Apply only after reviewing the preview:
 *   GOOGLE_APPLICATION_CREDENTIALS="/absolute/path/service-account.json" \
 *   CLINIC_APPLY_ROLE_MIGRATION=true npm run migrate-manager-role
 *
 * This runs with the Admin SDK and is intentionally not deployed as a callable.
 */
const admin = require('firebase-admin');

const apply = process.env.CLINIC_APPLY_ROLE_MIGRATION === 'true';
const legacyRole = 'receptionist';
const replacementRole = 'manager';

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();

async function listLegacyUsers() {
  const users = [];
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    users.push(...page.users.filter((user) => user.customClaims?.role === legacyRole));
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

async function migrate() {
  const users = await listLegacyUsers();
  console.log(`${apply ? 'Applying' : 'Previewing'} migration for ${users.length} legacy staff account(s).`);
  users.forEach((user) => console.log(`${user.uid}  ${user.email || '(no email)'}`));
  if (!apply || users.length === 0) {
    if (!apply) console.log('No changes made. Set CLINIC_APPLY_ROLE_MIGRATION=true to apply this migration.');
    return;
  }

  for (const user of users) {
    const claims = { ...(user.customClaims || {}), role: replacementRole };
    delete claims.doctorId;
    await admin.auth().setCustomUserClaims(user.uid, claims);
    await admin.auth().revokeRefreshTokens(user.uid);
  }

  const profiles = await db.collection('staffProfiles').where('role', '==', legacyRole).get();
  const batchSize = 400;
  for (let index = 0; index < profiles.docs.length; index += batchSize) {
    const batch = db.batch();
    profiles.docs.slice(index, index + batchSize).forEach((profile) => batch.set(profile.ref, {
      role: replacementRole,
      doctorId: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true }));
    await batch.commit();
  }
  console.log(`Migrated ${users.length} Authentication account(s) and ${profiles.size} staff profile(s). Users must sign in again.`);
}

migrate().catch((error) => {
  console.error('Could not migrate the legacy staff role:', error.message);
  process.exitCode = 1;
});
