// Emulator-backed callable tests. Run with:
//   npm run test:callables
// (firebase emulators:exec --only auth,firestore,functions, which starts the
// real functions runtime, so live Auth and the transaction path are executed
// rather than asserted from source).
import { createRequire } from 'node:module';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const requireFromFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const admin = requireFromFunctions('firebase-admin');

const PROJECT = 'demo-sood-clinic';
const PASSWORD = 'Synthetic-pass-1';
const GRACE_MINUTES = 15;
const IST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' });

const istToday = () => IST_DAY.format(new Date());
const minutesFromNow = (minutes) => new Date(Date.now() + minutes * 60 * 1000);
const unique = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Without the emulators (a bare `vitest run`), skip instead of failing: this
// suite is only meaningful under `npm run test:callables`.
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
  const { user } = await signInWithEmailAndPassword(clientAuth, email, PASSWORD);
  return user;
};

const seedAppointment = async (patch = {}) => {
  const id = unique('apt');
  await db.collection('appointments').doc(id).set({
    status: 'scheduled',
    doctorId: 'doc-harness',
    dateKey: istToday(),
    startsAt: admin.firestore.Timestamp.fromDate(minutesFromNow(-30)),
    endsAt: admin.firestore.Timestamp.fromDate(minutesFromNow(-10)),
    reference: 'SC-HARNESS',
    ...patch,
  });
  return id;
};

const appointment = async (id) => (await db.collection('appointments').doc(id).get()).data();
const events = async (id) => (await db.collection('appointments').doc(id).collection('events').get()).docs.map((doc) => doc.data());
const auditCount = async () => (await db.collection('auditLogs').get()).size;
const call = (data) => callable(data);

beforeAll(async () => {
  if (!emulators) return;
  admin.initializeApp({ projectId: PROJECT });
  authAdmin = admin.auth();
  db = admin.firestore();

  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-api-key' }, 'callables');
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  clientAuth = auth;
  const functions = getFunctions(app, 'asia-south1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  callable = httpsCallable(functions, 'transitionAppointment');
}, 60_000);

afterAll(async () => {
  if (!emulators) return;
  await Promise.all(created.map((uid) => authAdmin.deleteUser(uid).catch(() => {})));
  await admin.app().delete();
});

suite('transitionAppointment executes the live callable', () => {
  it('denies an anonymous caller before touching the appointment', async () => {
    const id = await seedAppointment({ startsAt: admin.firestore.Timestamp.fromDate(minutesFromNow(-30)) });
    await expect(call({ appointmentId: id, to: 'no_show' })).rejects.toMatchObject({ code: 'functions/permission-denied' });
    expect((await appointment(id)).status).toBe('scheduled');
    expect(await events(id)).toHaveLength(0);
  }, 30_000);

  it('rejects a no-show before start plus grace and writes nothing', async () => {
    await signIn('admin-harness', { role: 'admin' });
    const before = await auditCount();
    const id = await seedAppointment({ startsAt: admin.firestore.Timestamp.fromDate(minutesFromNow(-(GRACE_MINUTES - 5))) });
    await expect(call({ appointmentId: id, to: 'no_show' })).rejects.toMatchObject({ code: 'functions/failed-precondition' });
    expect((await appointment(id)).status).toBe('scheduled');
    expect(await events(id)).toHaveLength(0);
    expect(await auditCount()).toBe(before);
  }, 30_000);

  it('records a no-show once the grace period has passed, with one event and one audit row', async () => {
    await signIn('admin-harness', { role: 'admin' });
    const before = await auditCount();
    const id = await seedAppointment({ startsAt: admin.firestore.Timestamp.fromDate(minutesFromNow(-(GRACE_MINUTES + 1))) });
    const result = await call({ appointmentId: id, to: 'no_show' });
    expect(result.data).toEqual({ ok: true, status: 'no_show' });
    expect((await appointment(id)).status).toBe('no_show');
    const written = await events(id);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ from: 'scheduled', to: 'no_show', byRole: 'admin' });
    expect(await auditCount()).toBe(before + 1);
  }, 30_000);

  it('denies a doctor the no-show transition even after grace', async () => {
    await signIn('doctor-harness', { role: 'doctor', doctorId: 'doc-harness' });
    const id = await seedAppointment({ doctorId: 'doc-harness', startsAt: admin.firestore.Timestamp.fromDate(minutesFromNow(-(GRACE_MINUTES + 30))) });
    await expect(call({ appointmentId: id, to: 'no_show' })).rejects.toMatchObject({ code: 'functions/failed-precondition' });
    expect((await appointment(id)).status).toBe('scheduled');
  }, 30_000);

  it('refuses a doctor updating another doctor\'s appointment', async () => {
    await signIn('doctor-harness', { role: 'doctor', doctorId: 'doc-harness' });
    const id = await seedAppointment({ doctorId: 'other-doctor' });
    await expect(call({ appointmentId: id, to: 'confirmed' })).rejects.toMatchObject({ code: 'functions/permission-denied' });
    expect((await appointment(id)).status).toBe('scheduled');
  }, 30_000);

  it('checks a patient in only on the appointment IST date', async () => {
    await signIn('admin-harness', { role: 'admin' });
    const future = await seedAppointment({ dateKey: '2099-01-01' });
    await expect(call({ appointmentId: future, to: 'checked_in' })).rejects.toMatchObject({ code: 'functions/failed-precondition' });
    expect((await appointment(future)).status).toBe('scheduled');

    const today = await seedAppointment({ dateKey: istToday() });
    const result = await call({ appointmentId: today, to: 'checked_in' });
    expect(result.data).toEqual({ ok: true, status: 'checked_in' });
    expect((await appointment(today)).status).toBe('checked_in');
  }, 30_000);

  it('requires a cancellation reason and releases the held slot when cancelled', async () => {
    await signIn('admin-harness', { role: 'admin' });
    const slotId = `slot-${Date.now()}`;
    const id = await seedAppointment({ slotIds: [slotId] });
    await db.collection('appointmentSlots').doc(slotId).set({ doctorId: 'doc-harness', status: 'booked', appointmentId: id });

    await expect(call({ appointmentId: id, to: 'cancelled' })).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    expect((await appointment(id)).status).toBe('scheduled');

    const result = await call({ appointmentId: id, to: 'cancelled', reason: 'Synthetic clinic closure' });
    expect(result.data).toEqual({ ok: true, status: 'cancelled' });
    expect((await appointment(id)).status).toBe('cancelled');
    expect((await db.collection('appointmentSlots').doc(slotId).get()).exists).toBe(false);
  }, 30_000);

  it('drives check-in → in_consultation → completed for the owning doctor', async () => {
    await signIn('doctor-harness', { role: 'doctor', doctorId: 'doc-harness' });
    const id = await seedAppointment({ status: 'checked_in', doctorId: 'doc-harness' });
    expect((await call({ appointmentId: id, to: 'in_consultation' })).data).toEqual({ ok: true, status: 'in_consultation' });
    expect((await call({ appointmentId: id, to: 'completed' })).data).toEqual({ ok: true, status: 'completed' });
    expect((await appointment(id)).status).toBe('completed');
    expect((await events(id)).map((event) => `${event.from}->${event.to}`).sort()).toEqual(['checked_in->in_consultation', 'in_consultation->completed'].sort());
  }, 30_000);

  it('refuses a skipped state even for an administrator', async () => {
    await signIn('admin-harness', { role: 'admin' });
    const id = await seedAppointment();
    await expect(call({ appointmentId: id, to: 'completed' })).rejects.toMatchObject({ code: 'functions/failed-precondition' });
    expect((await appointment(id)).status).toBe('scheduled');
  }, 30_000);
});
