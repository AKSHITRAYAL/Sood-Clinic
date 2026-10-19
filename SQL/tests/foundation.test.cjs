const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { localDataConnect, seed, functionsRequire } = require('../scripts/local.cjs');
const toolsRequire = createRequire(require.resolve('firebase-tools/package.json'));
const { Client } = toolsRequire('pg');
let sql;
let clinic;
let admin;
const accessDenied = (error) => /permission.denied|unauthenticated|not authorized|not allowed|NO_ACCESS/i.test(error.message);

before(async () => {
  admin = localDataConnect();
  clinic = localDataConnect('clinic');
  sql = new Client({ host: '127.0.0.1', port: 9398, database: 'ak-sood-clinic-database', user: 'postgres' });
  await sql.connect();
  await seed();
});

after(async () => { await sql?.end(); });
// PGlite shares one backend session; clear rejected transaction state between cases.
afterEach(async () => { await sql?.query('ROLLBACK'); });

test('repeatable fixtures produce one linked catalog and integer-paise service', async () => {
  await seed();
  const counts = await sql.query('SELECT (SELECT count(*) FROM clinic_branches)::int AS branches, (SELECT count(*) FROM clinic_doctor_departments)::int AS memberships');
  assert.deepEqual(counts.rows[0], { branches: 1, memberships: 1 });
  const result = await clinic.executeQuery('GetPublicClinic', undefined, { impersonate: { unauthenticated: true } });
  assert.equal(result.data.clinicProfile.timezone, 'Asia/Kolkata');
  assert.equal(result.data.doctors.length, 1);
  assert.equal(result.data.services[0].durationMinutes, 20);
  assert.deepEqual(Object.keys(result.data).sort(), ['branches', 'clinicProfile', 'departments', 'doctors', 'services']);
});

test('database rejects dangling foreign keys and duplicate identifiers', async () => {
  await assert.rejects(sql.query('INSERT INTO clinic_doctor_departments (doctor_id, department_id) VALUES ($1, $2)', ['00000000-0000-4000-8000-000000000099', '00000000-0000-4000-8000-000000000002']), { code: '23503' });
  await assert.rejects(sql.query("INSERT INTO clinic_branches (id, code, name, address, timezone, active, created_at, updated_at) SELECT '00000000-0000-4000-8000-000000000098', code, name, address, timezone, active, created_at, updated_at FROM clinic_branches LIMIT 1"), { code: '23505' });
});

test('database rollback leaves no partial write after a failing relation', async () => {
  await sql.query('BEGIN');
  try {
    await sql.query("UPDATE clinic_branches SET name = 'Should roll back' WHERE code = 'SOOD'");
    await assert.rejects(sql.query('INSERT INTO clinic_doctor_departments (doctor_id, department_id) VALUES ($1, $2)', ['00000000-0000-4000-8000-000000000099', '00000000-0000-4000-8000-000000000002']), { code: '23503' });
  } finally {
    await sql.query('ROLLBACK');
  }
  assert.equal((await sql.query("SELECT name FROM clinic_branches WHERE code = 'SOOD'")).rows[0].name, 'Sood Clinic');
});

test('self-profile query rejects anonymous callers and binds reads to authenticated UID', async () => {
  await sql.query("INSERT INTO clinic_users (id, display_name, active, created_at, updated_at) VALUES ('sql-test-alice', 'Test Alice', true, now(), now()), ('sql-test-bob', 'Test Bob', true, now(), now())");
  await assert.rejects(clinic.executeQuery('GetOwnSqlProfile', undefined, { impersonate: { unauthenticated: true } }), accessDenied);
  const result = await clinic.executeQuery('GetOwnSqlProfile', undefined, { impersonate: { authClaims: { sub: 'sql-test-alice' } } });
  assert.equal(result.data.user.id, 'sql-test-alice');
  assert.equal(result.data.user.displayName, 'Test Alice');
  const missing = await clinic.executeQuery('GetOwnSqlProfile', undefined, { impersonate: { authClaims: { sub: 'sql-test-nobody' } } });
  assert.equal(missing.data.user, null);
});

test('IAM-only query and seed deny anonymous, patient and admin-claim callers', async () => {
  for (const impersonate of [{ unauthenticated: true }, { authClaims: { sub: 'sql-test-alice' } }, { authClaims: { sub: 'sql-test-admin', role: 'admin' } }]) {
    await assert.rejects(admin.executeQuery('CheckSqlFoundation', undefined, { impersonate }), accessDenied);
    await assert.rejects(admin.executeMutation('SeedFoundation', undefined, { impersonate }), accessDenied);
    await assert.rejects(admin.executeMutation('ImportPublicClinicContact', { name: 'Clinic', phone: '+918988207797', email: 'clinic@example.com', address: 'Test address', timezone: 'Asia/Kolkata' }, { impersonate }), accessDenied);
  }
});

test('private clinical and patient collections have no exposed connector operation', async () => {
  await assert.rejects(clinic.executeQuery('ListPatients', undefined, { impersonate: { authClaims: { sub: 'sql-test-manager', role: 'manager' } } }), /not found/i);
  const result = await sql.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'clinic_%'");
  assert.equal(result.rows.length, 22);
});

test('verified account save binds UID, records audit and rejects retries', async () => {
  const uid = 'sql-phase2-owner';
  const variables = { displayName: 'Test Account', requestId: '10000000-0000-4000-8000-000000000001' };
  const options = { impersonate: { authClaims: { sub: uid, email_verified: true } } };
  await clinic.executeMutation('SaveOwnSqlProfile', variables, options);
  const profile = await clinic.executeQuery('GetOwnSqlProfile', undefined, options);
  assert.equal(profile.data.user.id, uid);
  assert.equal(profile.data.user.displayName, 'Test Account');
  await assert.rejects(clinic.executeMutation('SaveOwnSqlProfile', variables, options), /REQUEST_ALREADY_APPLIED/);
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_audit_logs WHERE resource_id = $1', [uid])).rows[0].count, 1);
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_staff_profiles WHERE user_id = $1', [uid])).rows[0].count, 0);
});

test('account save rejects anonymous, unverified, inactive and invalid input', async () => {
  const variables = { displayName: 'Test Account', requestId: '10000000-0000-4000-8000-000000000002' };
  for (const impersonate of [{ unauthenticated: true }, { authClaims: { sub: 'sql-phase2-unverified', email_verified: false } }]) {
    await assert.rejects(clinic.executeMutation('SaveOwnSqlProfile', variables, { impersonate }), accessDenied);
  }
  const options = { impersonate: { authClaims: { sub: 'sql-phase2-validation', email_verified: true } } };
  for (const displayName of ['', ' ', ' leading', 'trailing ', 'a'.repeat(161), 'line\nbreak']) {
    await assert.rejects(clinic.executeMutation('SaveOwnSqlProfile', { ...variables, displayName }, options), accessDenied);
    await sql.query('ROLLBACK');
  }
  await sql.query("INSERT INTO clinic_users (id, display_name, active, created_at, updated_at) VALUES ('sql-phase2-inactive', 'Inactive', false, now(), now())");
  await assert.rejects(clinic.executeMutation('SaveOwnSqlProfile', variables, { impersonate: { authClaims: { sub: 'sql-phase2-inactive', email_verified: true } } }), /ACCOUNT_INACTIVE/);
  assert.equal((await sql.query("SELECT active FROM clinic_users WHERE id = 'sql-phase2-inactive'")).rows[0].active, false);
  await assert.rejects(clinic.executeMutation('SaveOwnSqlProfile', variables, { impersonate: { authClaims: { sub: 'sql-phase2-forced', email_verified: true, forcePasswordChange: true } } }), accessDenied);
  await assert.rejects(clinic.executeMutation('SaveOwnSqlProfile', { ...variables, uid: 'sql-test-bob', role: 'admin' }, options), /not expected|unexpected/i);
});

test('concurrent retry commits one profile receipt and audit only', async () => {
  const uid = 'sql-phase2-concurrent';
  const variables = { displayName: 'Concurrent Account', requestId: '10000000-0000-4000-8000-000000000003' };
  const options = { impersonate: { authClaims: { sub: uid, email_verified: true } } };
  const results = await Promise.allSettled([clinic.executeMutation('SaveOwnSqlProfile', variables, options), clinic.executeMutation('SaveOwnSqlProfile', variables, options)]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_audit_logs WHERE resource_id = $1', [uid])).rows[0].count, 1);
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_operation_receipts WHERE actor_uid = $1', [uid])).rows[0].count, 1);
});

test('generated browser SDK reads the public contact through the emulator', async () => {
  const { initializeApp, deleteApp } = require('firebase/app');
  const { getDataConnect, connectDataConnectEmulator } = require('firebase/data-connect');
  const { getPublicClinicContact, connectorConfig } = require('../generated/clinic');
  const app = initializeApp({ projectId: 'demo-sood-clinic', apiKey: 'local-test-only', appId: 'local-test' }, 'sql-browser-test');
  try {
    const dc = getDataConnect(app, connectorConfig);
    connectDataConnectEmulator(dc, '127.0.0.1', 9399);
    assert.equal((await getPublicClinicContact(dc)).data.clinicProfile.name, 'Sood Clinic');
  } finally { await deleteApp(app); }
});

test('staff SQL reconciliation is bounded, idempotent and inaccessible to browser claims', async () => {
  const { createStaffDirectory, sqlStaffStore } = require('../../functions/lib/sqlStaffDirectory');
  const actor = { uid: 'sql-directory-admin', displayName: 'Synthetic admin', email: 'admin@example.test', customClaims: { role: 'admin' }, disabled: false };
  const manager = { uid: 'sql-directory-manager', displayName: 'Synthetic manager', email: 'manager@example.test', customClaims: { role: 'manager' }, disabled: false };
  const patient = { uid: 'sql-directory-patient', customClaims: {}, disabled: false };
  let users = [actor, manager, patient];
  const handler = createStaffDirectory({
    auth: { getUser: async () => actor, listUsers: async () => ({ users }) },
    store: sqlStaffStore(admin),
  });
  const request = { auth: { uid: actor.uid, token: { role: 'admin', auth_time: 1 } }, data: { limit: 1 } };
  const first = await handler(request);
  assert.equal(first.updated, 2);
  assert.equal(first.total, 2);
  assert.equal(first.staff.length, 1);
  assert.equal(first.nextCursor, actor.uid);
  const second = await handler({ ...request, data: { limit: 1, cursor: first.nextCursor } });
  assert.equal(second.updated, 0);
  assert.equal(second.staff[0].uid, manager.uid);
  assert.equal(second.nextCursor, null);
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_users WHERE id=$1', [patient.uid])).rows[0].count, 0);
  users = [actor, patient];
  assert.equal((await handler(request)).updated, 1);
  assert.equal((await handler(request)).total, 1);
  const removed = (await sql.query('SELECT role, active FROM clinic_staff_profiles WHERE user_id=$1', [manager.uid])).rows[0];
  assert.deepEqual(removed, { role: 'none', active: false });
  assert.equal((await sql.query("SELECT count(*)::int AS count FROM clinic_audit_logs WHERE action='staff_identity_reconciled'")).rows[0].count, 3);
  for (const impersonate of [{ unauthenticated: true }, { authClaims: { sub: actor.uid, role: 'admin' } }]) {
    await assert.rejects(admin.executeQuery('ListStaffIdentityPage', { afterUid: '', limit: 10 }, { impersonate }), accessDenied);
    await assert.rejects(admin.executeMutation('UpsertStaffIdentity', { uid: actor.uid, name: 'Denied', email: '', role: 'admin', doctorLegacyId: null, accountActive: true, active: true, requiresPasswordChange: false, sessionValidAfterSeconds: '0', actorUid: actor.uid }, { impersonate }), accessDenied);
  }
});

test('SQL staff lock serializes changes and rolls back an incorrect owner', async () => {
  const actorUid = 'sql-directory-admin';
  const first = { actorUid, actorRole: 'admin', targetUid: actorUid, action: 'staff_change_started', requestId: '30000000-0000-4000-8000-000000000001' };
  const next = { ...first, requestId: '30000000-0000-4000-8000-000000000002' };
  await admin.executeMutation('BeginStaffAccessChange', first);
  const pending = (await admin.executeQuery('InspectStaffAccessChange', { requestId: first.requestId })).data.auditLog;
  assert.equal(pending.resourceId, actorUid);
  assert.equal(pending.action, first.action);
  await assert.rejects(admin.executeMutation('BeginStaffAccessChange', next));
  await sql.query('ROLLBACK');
  const { action, ...owner } = first;
  assert.equal(action, 'staff_change_started');
  await assert.rejects(admin.executeMutation('AbortStaffAccessChange', { ...owner, requestId: next.requestId }), /STAFF_LOCK_NOT_OWNED/);
  await sql.query('ROLLBACK');
  await admin.executeMutation('AbortStaffAccessChange', owner);
  assert.equal((await admin.executeQuery('InspectStaffAccessLock')).data.staffAccessLock, null);
  for (const impersonate of [{ unauthenticated: true }, { authClaims: { sub: actorUid, role: 'admin' } }]) {
    await assert.rejects(admin.executeMutation('BeginStaffAccessChange', next, { impersonate }), accessDenied);
    await assert.rejects(admin.executeQuery('ListStaffAudit', { limit: 10 }, { impersonate }), accessDenied);
  }
});

test('real Auth password replacement commits SQL staff state and audit without Firestore', async () => {
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9099');
  const { getAuth } = functionsRequire('firebase-admin/auth');
  const { createStaffLifecycle, sqlStaffLifecycleStore } = require('../../functions/lib/staffLifecycle');
  const auth = getAuth(admin.app);
  const uid = 'sql-password-replacement';
  await auth.createUser({ uid, email: 'password-fixture@example.test', password: 'Temporary9%' });
  await auth.setCustomUserClaims(uid, { role: 'manager', forcePasswordChange: true });
  const signIn = async (password) => {
    const response = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-only', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'password-fixture@example.test', password, returnSecureToken: true }),
    });
    return { ok: response.ok, data: await response.json() };
  };
  const login = await signIn('Temporary9%');
  assert.equal(login.ok, true);
  const token = await auth.verifyIdToken(login.data.idToken);
  const lifecycle = createStaffLifecycle({ auth, store: sqlStaffLifecycleStore(admin) });
  await lifecycle.completePassword({ auth: { uid, token }, data: { newPassword: 'Replacement9%' } });
  assert.equal((await signIn('Temporary9%')).ok, false);
  const replacement = await signIn('Replacement9%');
  assert.equal(replacement.ok, true);
  assert.equal((await auth.verifyIdToken(replacement.data.idToken)).forcePasswordChange, false);
  assert.equal((await auth.getUser(uid)).customClaims.forcePasswordChange, false);
  const row = (await sql.query('SELECT requires_password_change FROM clinic_staff_profiles WHERE user_id=$1', [uid])).rows[0];
  assert.equal(row.requires_password_change, false);
  assert.equal((await sql.query("SELECT count(*)::int AS count FROM clinic_audit_logs WHERE resource_id=$1 AND action='staff_password_changed'", [uid])).rows[0].count, 1);
  assert.equal((await admin.executeQuery('InspectStaffAccessLock')).data.staffAccessLock, null);
});

test('real Auth staff provisioning, doctor assignment and suspension persist only to SQL', async () => {
  const { getAuth } = functionsRequire('firebase-admin/auth');
  const { createStaffLifecycle, sqlStaffLifecycleStore } = require('../../functions/lib/staffLifecycle');
  const auth = getAuth(admin.app);
  const actorUid = 'sql-lifecycle-administrator';
  await auth.createUser({ uid: actorUid, email: 'lifecycle-admin@example.test', password: 'AdminTest9%' });
  await auth.setCustomUserClaims(actorUid, { role: 'admin' });
  const lifecycle = createStaffLifecycle({ auth, store: sqlStaffLifecycleStore(admin) });
  const call = (data) => lifecycle.manage({ auth: { uid: actorUid, token: { role: 'admin', auth_time: Math.floor(Date.now() / 1000) } }, data });
  const email = 'managed-lifecycle@example.test';
  const created = await call({ action: 'provision', email, displayName: 'Fixture Manager', role: 'manager', password: 'ManagerTest9%' });
  const user = await auth.getUser(created.uid);
  assert.equal(user.disabled, false);
  assert.equal(user.customClaims.forcePasswordChange, true);
  assert.equal(user.customClaims.role, 'manager');
  await assert.rejects(call({ action: 'provision', email, displayName: 'Fixture Manager', role: 'manager', password: 'OtherPassword9%' }), (error) => error.code === 'already-exists');
  await call({ action: 'updateAccess', email, displayName: 'Fixture Doctor', role: 'doctor', doctorId: 'brig-ak-sood' });
  assert.equal((await auth.getUser(created.uid)).customClaims.doctorId, 'brig-ak-sood');
  await call({ action: 'disable', email, disabled: true });
  assert.equal((await auth.getUser(created.uid)).disabled, true);
  const row = (await sql.query('SELECT role, doctor_legacy_id, active FROM clinic_staff_profiles WHERE user_id=$1', [created.uid])).rows[0];
  assert.deepEqual(row, { role: 'doctor', doctor_legacy_id: 'brig-ak-sood', active: false });
  await assert.rejects(call({ action: 'disable', email: 'lifecycle-admin@example.test', disabled: true }), (error) => error.code === 'failed-precondition');
  assert.equal((await admin.executeQuery('InspectStaffAccessLock')).data.staffAccessLock, null);
  const events = (await admin.executeQuery('ListStaffAudit', { limit: 50 })).data.auditLogs;
  assert.ok(events.some((row) => row.resourceId === created.uid && row.action === 'staff_suspended'));
});

async function linkingFixture(suffix) {
  const { getAuth } = functionsRequire('firebase-admin/auth');
  const { createPatientLinking, sqlPatientLinkStore } = require('../../functions/lib/patientLinking');
  const auth = getAuth(admin.app);
  const uid = `sql-link-${suffix}`;
  const patientId = `40000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
  await auth.createUser({ uid, email: `link-${suffix}@example.test`, emailVerified: true });
  await sql.query('INSERT INTO clinic_users (id, display_name, active, created_at, updated_at) VALUES ($1, $2, true, now(), now())', [uid, 'Synthetic account']);
  await sql.query('INSERT INTO clinic_patients (id, uhid, display_name, phone, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now())', [patientId, `TEST-LINK-${suffix}`, 'Synthetic patient', '0000000000']);
  const service = createPatientLinking({ auth, store: sqlPatientLinkStore(admin) });
  const staff = (data) => ({ auth: { uid: 'sql-lifecycle-administrator', token: { role: 'admin', auth_time: Math.floor(Date.now() / 1000) } }, data });
  const accept = (code, targetUid = uid) => service.accept({ auth: { uid: targetUid, token: { email_verified: true, auth_time: Math.floor(Date.now() / 1000) } }, data: { code } });
  const issue = (relationship = 'self', evidence = 'in_person_identity') => service.issue(staff({ patientId, targetUid: uid, relationship, evidence }));
  const revoke = () => service.revoke(staff({ patientId, targetUid: uid }));
  return { uid, patientId, issue, accept, revoke, service, auth };
}

test('verified clinic code links account to a separate patient and is consumed with its audit atomically', async () => {
  const fixture = await linkingFixture(1);
  const { code } = await fixture.issue();
  const row = (await sql.query('SELECT token_hash FROM clinic_patient_link_invitations WHERE user_id=$1', [fixture.uid])).rows[0];
  assert.equal(row.token_hash.length, 64);
  assert.notEqual(row.token_hash, code);
  assert.deepEqual(await fixture.accept(code), { linked: true });
  assert.deepEqual((await sql.query("SELECT resource_id FROM clinic_audit_logs WHERE actor_uid=$1 AND action='patient_link_accepted'", [fixture.uid])).rows, [{ resource_id: `${fixture.patientId}/${fixture.uid}` }]);
  const link = (await sql.query('SELECT patient_id, user_id, relationship, verified_by FROM clinic_patient_links WHERE user_id=$1', [fixture.uid])).rows[0];
  assert.deepEqual(link, { patient_id: fixture.patientId, user_id: fixture.uid, relationship: 'self', verified_by: 'sql-lifecycle-administrator' });
  await assert.rejects(fixture.accept(code));
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_patient_link_invitations WHERE user_id=$1', [fixture.uid])).rows[0].count, 0);
  assert.equal((await sql.query("SELECT count(*)::int AS count FROM clinic_audit_logs WHERE resource_id=$1 AND action='patient_link_accepted'", [`${fixture.patientId}/${fixture.uid}`])).rows[0].count, 1);
});

test('expired, replaced and cross-account linking codes cannot grant access', async () => {
  const fixture = await linkingFixture(2);
  const { code: oldCode } = await fixture.issue();
  const { code } = await fixture.issue();
  await assert.rejects(fixture.accept(oldCode));
  await assert.rejects(fixture.accept(code, 'sql-link-1'));
  await sql.query("UPDATE clinic_patient_link_invitations SET expires_at=now()-interval '1 minute' WHERE user_id=$1", [fixture.uid]);
  await assert.rejects(fixture.accept(code));
  await sql.query('ROLLBACK');
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_patient_links WHERE user_id=$1', [fixture.uid])).rows[0].count, 0);
});

test('concurrent code consumption grants one link and one acceptance audit', async () => {
  const fixture = await linkingFixture(3);
  const { code } = await fixture.issue();
  const results = await Promise.allSettled([fixture.accept(code), fixture.accept(code)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  await sql.query('ROLLBACK');
  assert.equal((await sql.query("SELECT count(*)::int AS count FROM clinic_audit_logs WHERE resource_id=$1 AND action='patient_link_accepted'", [`${fixture.patientId}/${fixture.uid}`])).rows[0].count, 1);
});

test('revocation cancels pending codes and accepted links without changing other family members', async () => {
  const fixture = await linkingFixture(4);
  const { code: cancelled } = await fixture.issue('guardian', 'guardian_authority');
  await fixture.revoke();
  await assert.rejects(fixture.accept(cancelled));
  const { code } = await fixture.issue('guardian', 'guardian_authority');
  await fixture.accept(code);
  await fixture.revoke();
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_patient_links WHERE user_id=$1', [fixture.uid])).rows[0].count, 0);
  assert.equal((await sql.query("SELECT count(*)::int AS count FROM clinic_patient_links WHERE user_id='sql-link-1'")).rows[0].count, 1);
});

test('inactive accounts and archived patients roll back code consumption without an acceptance audit', async () => {
  const fixture = await linkingFixture(5);
  const { code } = await fixture.issue();
  await sql.query('UPDATE clinic_users SET active=false WHERE id=$1', [fixture.uid]);
  await assert.rejects(fixture.accept(code));
  await sql.query('ROLLBACK');
  await sql.query('UPDATE clinic_users SET active=true WHERE id=$1', [fixture.uid]);
  await sql.query('UPDATE clinic_patients SET archived_at=now() WHERE id=$1', [fixture.patientId]);
  await assert.rejects(fixture.accept(code));
  await sql.query('ROLLBACK');
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_patient_link_invitations WHERE user_id=$1', [fixture.uid])).rows[0].count, 1);
  assert.equal((await sql.query("SELECT count(*)::int AS count FROM clinic_audit_logs WHERE resource_id=$1 AND action='patient_link_accepted'", [`${fixture.patientId}/${fixture.uid}`])).rows[0].count, 0);
});

test('patient-link IAM operations deny browser patients, managers and administrators', async () => {
  const issue = { patientId: '40000000-0000-4000-8000-000000000001', targetUid: 'sql-link-1', tokenHash: 'a'.repeat(64), relationship: 'self', evidence: 'in_person_identity', actorUid: 'sql-lifecycle-administrator', actorRole: 'admin', expiresAt: new Date(Date.now() + 600000).toISOString(), resourceId: '40000000-0000-4000-8000-000000000001/sql-link-1' };
  for (const impersonate of [{ unauthenticated: true }, { authClaims: { sub: 'sql-link-1', email_verified: true } }, { authClaims: { sub: 'manager', role: 'manager' } }, { authClaims: { sub: 'admin', role: 'admin' } }]) {
    await assert.rejects(admin.executeMutation('IssuePatientLinkInvitation', issue, { impersonate }), accessDenied);
    await assert.rejects(admin.executeQuery('FindPatientLinkInvitation', { tokenHash: issue.tokenHash, targetUid: issue.targetUid }, { impersonate }), accessDenied);
    await assert.rejects(admin.executeMutation('AcceptPatientLinkInvitation', { patientId: issue.patientId, targetUid: issue.targetUid, tokenHash: issue.tokenHash, relationship: 'self', verifiedBy: issue.actorUid, resourceId: issue.resourceId }, { impersonate }), accessDenied);
    await assert.rejects(admin.executeMutation('RevokePatientLink', { patientId: issue.patientId, targetUid: issue.targetUid, actorUid: issue.actorUid, actorRole: 'admin', resourceId: issue.resourceId }, { impersonate }), accessDenied);
  }
});

test('family links support multiple patients/accounts and concurrent revocation never leaves access behind', async () => {
  const first = await linkingFixture(6);
  const second = await linkingFixture(7);
  const { code: firstCode } = await first.issue();
  await first.accept(firstCode);
  const staffRequest = (patientId, targetUid, extra = {}) => ({ auth: { uid: 'sql-lifecycle-administrator', token: { role: 'admin', auth_time: Math.floor(Date.now() / 1000) } }, data: { patientId, targetUid, ...extra } });
  const { code } = await first.service.issue(staffRequest(second.patientId, first.uid, { relationship: 'guardian', evidence: 'guardian_authority' }));
  await first.accept(code);
  const { code: shared } = await second.issue();
  await second.accept(shared);
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_patient_links WHERE user_id=$1', [first.uid])).rows[0].count, 2);
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_patient_links WHERE patient_id=$1', [second.patientId])).rows[0].count, 2);
  await first.service.revoke(staffRequest(second.patientId, first.uid));
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_patient_links WHERE patient_id=$1', [second.patientId])).rows[0].count, 1);
  await second.revoke();
  const { code: racing } = await second.issue();
  const results = await Promise.allSettled([second.accept(racing), second.revoke()]);
  assert.equal(results[1].status, 'fulfilled');
  await sql.query('ROLLBACK');
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_patient_links WHERE user_id=$1', [second.uid])).rows[0].count, 0);
  assert.equal((await sql.query('SELECT count(*)::int AS count FROM clinic_patient_link_invitations WHERE user_id=$1', [second.uid])).rows[0].count, 0);
});
