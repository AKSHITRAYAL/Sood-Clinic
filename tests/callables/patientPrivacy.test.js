import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
const require = createRequire(new URL('../../functions/package.json', import.meta.url)); const admin = require('firebase-admin');
const suite = process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST ? describe : describe.skip;
let app; let db; let auth; let api;
const uid = `privacy-admin-${Date.now()}`; const patientId = `privacy-patient-${Date.now()}`;
beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) return;
  admin.initializeApp({ projectId: 'demo-sood-clinic' }); db = admin.firestore();
  await admin.auth().createUser({ uid, email: `${uid}@synthetic.test`, password: 'Synthetic-pass-1' }); await admin.auth().setCustomUserClaims(uid, { role: 'admin' });
  app = initializeApp({ projectId: 'demo-sood-clinic', apiKey: 'demo-key' }, 'patient-privacy'); auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const functions = getFunctions(app, 'asia-south1'); connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  api = async (name, data) => (await httpsCallable(functions, name)(data)).data;
  await signInWithEmailAndPassword(auth, `${uid}@synthetic.test`, 'Synthetic-pass-1');
  await db.collection('patients').doc(patientId).set({ displayName: 'Synthetic Patient', phone: '+919000000001', uhid: 'SC-900001', allergies: 'private allergy', currentMedications: 'private medication', healthNotes: 'private notes', bloodGroup: 'AB+' });
});
afterAll(async () => { if (!db) return; await db.collection('patients').doc(patientId).delete(); await db.collection('patientDirectory').doc(patientId).delete(); await admin.auth().deleteUser(uid); await deleteApp(app); await admin.app().delete(); });
suite('administrator demographic boundary', () => {
  it('returns demographics without clinical fields and rejects clinical edits without writing', async () => {
    const result = await api('getAdminPatientProfile', { uid: patientId }); expect(result.profile.displayName).toBe('Synthetic Patient');
    for (const key of ['allergies', 'currentMedications', 'healthNotes', 'bloodGroup']) {
      expect(result.profile).not.toHaveProperty(key);
      await expect(api('updateAdminPatientProfile', { uid: patientId, profile: { displayName: 'Synthetic Patient', [key]: 'overwrite' } })).rejects.toMatchObject({ code: 'functions/permission-denied' });
    }
    expect((await db.collection('patients').doc(patientId).get()).get('allergies')).toBe('private allergy');
  }, 30_000);
  it('updates demographic details without clearing existing health information', async () => {
    await api('updateAdminPatientProfile', { uid: patientId, profile: { displayName: 'Updated Synthetic Patient', phone: '+919000000001' } });
    const row = (await db.collection('patients').doc(patientId).get()).data();
    expect(row.displayName).toBe('Updated Synthetic Patient'); expect(row.allergies).toBe('private allergy'); expect(row.currentMedications).toBe('private medication'); expect(row.healthNotes).toBe('private notes'); expect(row.bloodGroup).toBe('AB+');
  }, 30_000);
});
