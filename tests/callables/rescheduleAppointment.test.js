// Emulator-backed authorization/state tests for the staff reschedule callable.
// The success path also needs the Data Connect emulator (catalogue + booking
// settings), so it is not executed here; every refusal happens before that read.
import { createRequire } from 'node:module';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const requireFromFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const admin = requireFromFunctions('firebase-admin');

const PROJECT = 'demo-sood-clinic';
const PASSWORD = 'Synthetic-pass-1';
const IST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });

const emulators = Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST);
const suite = emulators ? describe : describe.skip;

let authAdmin;
let db;
let clientAuth;
let callable;
const created = [];

const signIn = async (uid, claims) => {
  const email = `${uid}@synthetic.test`;
  try {
    await authAdmin.createUser({ uid, email, password: PASSWORD });
    if (!created.includes(uid)) created.push(uid);
  } catch (error) {
    if (error.code !== 'auth/uid-already-exists') throw error;
  }
  await authAdmin.setCustomUserClaims(uid, claims);
  await signInWithEmailAndPassword(clientAuth, email, PASSWORD);
};

const seed = async (patch = {}) => {
  const id = `apt-rs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.collection('appointments').doc(id).set({
    status: 'scheduled',
    doctorId: 'doc-harness',
    dateKey: IST_DAY.format(new Date()),
    startsAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 60 * 60 * 1000)),
    endsAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 80 * 60 * 1000)),
    ...patch,
  });
  return id;
};
const status = async (id) => (await db.collection('appointments').doc(id).get()).data().status;

beforeAll(async () => {
  if (!emulators) return;
  admin.initializeApp({ projectId: PROJECT });
  authAdmin = admin.auth();
  db = admin.firestore();
  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-api-key' }, 'reschedule');
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  clientAuth = auth;
  const functions = getFunctions(app, 'asia-south1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  callable = httpsCallable(functions, 'rescheduleAppointment');
}, 60_000);

afterAll(async () => {
  if (!emulators) return;
  await Promise.all(created.map((uid) => authAdmin.deleteUser(uid).catch(() => {})));
  await admin.app().delete();
});

suite('rescheduleAppointment authorization', () => {
  it('denies an anonymous caller', async () => {
    const id = await seed();
    await expect(callable({ appointmentId: id, dateKey: '2099-01-01', time: '09:00' })).rejects.toMatchObject({ code: 'functions/permission-denied' });
    expect(await status(id)).toBe('scheduled');
  }, 30_000);

  it('rejects malformed ids, dates and times before reading anything', async () => {
    await signIn('admin-rs', { role: 'admin' });
    for (const payload of [
      { appointmentId: 'has spaces', dateKey: '2099-01-01', time: '09:00' },
      { appointmentId: 'apt-x', dateKey: '2099-1-1', time: '09:00' },
      { appointmentId: 'apt-x', dateKey: '2099-01-01', time: '9:00' },
      { appointmentId: 'apt-x', dateKey: '2099-01-01', time: '24:00' },
    ]) {
      await expect(callable(payload)).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    }
  }, 30_000);

  it('lets a doctor reschedule only their own appointment', async () => {
    await signIn('doctor-rs', { role: 'doctor', doctorId: 'doc-harness' });
    const other = await seed({ doctorId: 'other-doctor' });
    await expect(callable({ appointmentId: other, dateKey: '2099-01-01', time: '09:00' })).rejects.toMatchObject({ code: 'functions/permission-denied' });
    expect(await status(other)).toBe('scheduled');
  }, 30_000);

  it('refuses closed appointments for every staff role', async () => {
    await signIn('admin-rs', { role: 'admin' });
    for (const closed of ['completed', 'cancelled', 'no_show', 'checked_in', 'in_consultation']) {
      const id = await seed({ status: closed });
      await expect(callable({ appointmentId: id, dateKey: '2099-01-01', time: '09:00' })).rejects.toMatchObject({ code: 'functions/failed-precondition' });
      expect(await status(id)).toBe(closed);
    }
  }, 30_000);
});
