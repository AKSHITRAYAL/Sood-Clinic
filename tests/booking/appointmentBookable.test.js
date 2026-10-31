// P0-02 booking callables: executes `getAvailability` and `createBooking` from
// functions/index.js against the real runtime.
// Run with `npm run test:booking` (auth + firestore + functions + dataconnect on the
// demo project). Availability context reads the catalogue and booking settings through
// Data Connect, so the SQL emulator is required and the fixture seed runs first.
// Outside the emulators every case is skipped, so a bare `vitest run` stays green.
import { createRequire } from 'node:module';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const requireFromFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
// Resolve from the functions directory: '../SQL/...' is the repository root sibling.
const { localDataConnect, seed } = requireFromFunctions('../SQL/scripts/local.cjs');
const admin = requireFromFunctions('firebase-admin');
const toolsRequire = createRequire(new URL('../../node_modules/firebase-tools/package.json', import.meta.url));
const { Client } = toolsRequire('pg');

const PROJECT = 'demo-sood-clinic';
const BRANCH = 'sood-clinic';
const DEPARTMENT = 'gastroenterology';
const DOCTOR = 'brig-ak-sood';
const VISIT_TYPE = 'consultation';
const PASSWORD = 'Synthetic-pass-1';

const emulators = Boolean(
  process.env.FIREBASE_AUTH_EMULATOR_HOST
  && process.env.FIRESTORE_EMULATOR_HOST
  && process.env.DATA_CONNECT_EMULATOR_HOST,
);
const suite = emulators ? describe : describe.skip;

const istKey = (offsetDays = 0) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(Date.now() + offsetDays * 86_400_000));
const weekdayOf = (dateKey) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};

let db;
let sql;
let config;
let createBooking;
let getAvailability;
let rescheduleAppointment;
let transitionAppointment;
let openDay;
const createdUsers = [];

const requestId = () => `booking-test-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
const newPhone = () => `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

const submission = (overrides = {}) => ({
  branchId: BRANCH,
  departmentId: DEPARTMENT,
  doctorId: DOCTOR,
  dateKey: openDay,
  time: '09:00',
  visitTypeId: VISIT_TYPE,
  patient: {
    name: 'Synthetic Patient',
    phone: newPhone(),
    email: 'patient@synthetic.test',
    consentToTreatment: true,
  },
  reason: 'Synthetic reason',
  consentVersion: 'booking-v1',
  clientRequestId: requestId(),
  ...overrides,
});

const appointmentCount = async () => (await db.collection('appointments').get()).size;
const slotDoc = (dateKey, time) => db.collection('appointmentSlots')
  .doc(`${DOCTOR}_${dateKey.replaceAll('-', '')}_${time.replace(':', '')}`);

const signInStaff = async (uid, claims) => {
  await config.authAdmin.createUser({ uid, email: `${uid}@synthetic.test`, password: PASSWORD });
  createdUsers.push(uid);
  await config.authAdmin.setCustomUserClaims(uid, claims);
  await signInWithEmailAndPassword(config.auth, `${uid}@synthetic.test`, PASSWORD);
};

const signInPatient = async (uid) => {
  await config.authAdmin.createUser({ uid, email: `${uid}@synthetic.test`, password: PASSWORD });
  createdUsers.push(uid);
  await config.authAdmin.setCustomUserClaims(uid, { role: 'patient' });
  await signInWithEmailAndPassword(config.auth, `${uid}@synthetic.test`, PASSWORD);
};

beforeAll(async () => {
  if (!emulators) return;
  admin.initializeApp({ projectId: PROJECT });
  db = admin.firestore();
  const dc = localDataConnect();
  await seed();
  sql = new Client({ host: '127.0.0.1', port: 9398, database: 'ak-sood-clinic-database', user: 'postgres' });
  await sql.connect();
  // The foundation seed carries catalogue rows but no booking policy row, and the
  // settings projection requires one active format whose code matches its legacy id.
  await sql.query("DELETE FROM clinic_settings WHERE id='primary'");
  // slot_minutes is deferred from the first production migration with the legacy
  // config mapper; only the three approved interval/buffer columns are seeded here.
  await sql.query("INSERT INTO clinic_settings(id,booking_window_days,lead_minutes,interval_minutes,buffer_before_minutes,buffer_after_minutes,cancel_cutoff_minutes,auto_confirm,updated_at) VALUES('primary',14,30,20,0,0,120,false,now())");
  await sql.query("UPDATE clinic_services SET legacy_id='consultation',legacy_sort_order=0,updated_at=now() WHERE code='consultation'");

  openDay = istKey(3);
  // Recurring weekly hours are a Firestore-era scheduling source, not catalogue authority.
  await db.collection('doctorSchedules').doc(DOCTOR).set({
    sessions: Array.from({ length: 7 }, (_, weekday) => ({ weekday, start: '09:00', end: '12:00' })),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-api-key' }, 'booking-harness');
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const functions = getFunctions(app, 'asia-south1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  createBooking = httpsCallable(functions, 'createBooking');
  getAvailability = httpsCallable(functions, 'getAvailability');
  rescheduleAppointment = httpsCallable(functions, 'rescheduleAppointment');
  transitionAppointment = httpsCallable(functions, 'transitionAppointment');
  config = { auth, authAdmin: admin.auth() };
}, 180_000);

beforeEach(async () => {
  if (!emulators) return;
  for (const name of ['appointments', 'appointmentSlots', 'bookingRequests', 'auditLogs', 'rateLimits', 'scheduleExceptions']) {
    await db.recursiveDelete(db.collection(name));
  }
  if (createdUsers.length) {
    await Promise.all(createdUsers.splice(0).map((uid) => config.authAdmin.deleteUser(uid).catch(() => {})));
  }
}, 60_000);

afterAll(async () => {
  if (!emulators) return;
  await Promise.all(createdUsers.map((uid) => config.authAdmin.deleteUser(uid).catch(() => {})));
  await sql?.query("DELETE FROM clinic_settings WHERE id='primary'");
  await sql?.query("UPDATE clinic_services SET legacy_id=NULL,legacy_sort_order=NULL,updated_at=now() WHERE code='consultation'");
  await sql?.end();
}, 60_000);

suite('getAvailability', () => {
  it('returns ordered IST slots for a published open day', async () => {
    const { data } = await getAvailability({ doctorId: DOCTOR, dateKey: openDay, visitTypeId: VISIT_TYPE });
    expect(data.timezone).toBe('Asia/Kolkata');
    expect(data.visitType).toMatchObject({ id: VISIT_TYPE, minutes: 20 });
    expect(data.calendar).toEqual({ connected: false });
    expect(data.slots.length).toBeGreaterThan(0);
    const times = data.slots.map((slot) => slot.time);
    expect(times).toEqual([...times].sort());
    expect(times[0]).toBe('09:00');
    expect(times.at(-1)).toBe('11:40');
    expect(data.slots[0].slotId).toBe(`${DOCTOR}_${openDay.replaceAll('-', '')}_0900`);
    expect(new Date(data.slots[0].startsAt).toISOString()).toBe(`${openDay}T03:30:00.000Z`);
    expect(new Date(data.slots[0].endsAt).getTime() - new Date(data.slots[0].startsAt).getTime()).toBe(20 * 60 * 1000);
  }, 60_000);

  it('returns no slots for a closed exception day or a date outside the booking window', async () => {
    await db.collection('scheduleExceptions').doc(`${DOCTOR}_${openDay}`).set({ type: 'closed', sessions: [] });
    expect((await getAvailability({ doctorId: DOCTOR, dateKey: openDay })).data.slots).toEqual([]);
    expect((await getAvailability({ doctorId: DOCTOR, dateKey: istKey(40) })).data.slots).toEqual([]);
  }, 60_000);

  it('rejects malformed input and an unpublished doctor', async () => {
    await expect(getAvailability({ doctorId: DOCTOR, dateKey: '2026-1-1' })).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    await expect(getAvailability({ dateKey: openDay })).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    await expect(getAvailability({ doctorId: 'not-a-doctor', dateKey: openDay })).rejects.toMatchObject({ code: 'functions/not-found' });
  }, 60_000);
});

suite('createBooking', () => {
  it('writes the appointment, slot lock, event, audit row and receipt together', async () => {
    const payload = submission({ time: '09:20' });
    const { data } = await createBooking(payload);
    expect(data.status).toBe('scheduled');
    expect(data.idempotent).toBe(false);
    expect(data.reference).toMatch(/^SC-[0-9A-F]{8}$/);

    const appointment = (await db.collection('appointments').doc(data.appointmentId).get()).data();
    expect(appointment).toMatchObject({
      reference: data.reference,
      status: 'scheduled',
      doctorId: DOCTOR,
      branchId: BRANCH,
      departmentId: DEPARTMENT,
      visitType: VISIT_TYPE,
      dateKey: openDay,
      phoneKey: payload.patient.phone,
      source: 'web',
      patientId: null,
      createdBy: { uid: null, role: 'public' },
    });
    expect(appointment.slotIds).toHaveLength(1);
    expect(appointment.patientSnapshot).toMatchObject({ name: payload.patient.name, phone: payload.patient.phone });
    expect(appointment.consent).toMatchObject({ version: 'booking-v1' });

    const slot = (await slotDoc(openDay, '09:20').get()).data();
    expect(slot).toMatchObject({ status: 'booked', appointmentId: data.appointmentId, doctorId: DOCTOR, dateKey: openDay });

    const events = await db.collection('appointments').doc(data.appointmentId).collection('events').get();
    expect(events.docs.map((doc) => ({ from: doc.get('from'), to: doc.get('to'), byRole: doc.get('byRole') })))
      .toEqual([{ from: null, to: 'scheduled', byRole: 'public' }]);
    const audits = await db.collection('auditLogs').where('action', '==', 'appointment_created').get();
    expect(audits.size).toBe(1);
    expect(audits.docs[0].get('resource')).toEqual({ type: 'appointment', id: data.appointmentId });
    expect((await db.collection('bookingRequests').doc(payload.clientRequestId).get()).data())
      .toMatchObject({ appointmentId: data.appointmentId, reference: data.reference, status: 'scheduled' });

    // The booked slot disappears from the next availability read.
    const after = await getAvailability({ doctorId: DOCTOR, dateKey: openDay });
    expect(after.data.slots.map((item) => item.time)).not.toContain('09:20');
  }, 90_000);

  it('replays the same clientRequestId without a second appointment', async () => {
    const payload = submission({ time: '09:40' });
    const first = await createBooking(payload);
    const again = await createBooking(payload);
    expect(again.data).toEqual({ ...first.data, idempotent: true });
    expect(await appointmentCount()).toBe(1);
    expect((await db.collection('auditLogs').get()).size).toBe(1);
    expect((await slotDoc(openDay, '09:40').get()).get('appointmentId')).toBe(first.data.appointmentId);
  }, 90_000);

  it('lets exactly one of two parallel bookings win the slot', async () => {
    const outcomes = await Promise.allSettled([
      createBooking(submission({ time: '10:00' })),
      createBooking(submission({ time: '10:00' })),
    ]);
    const fulfilled = outcomes.filter((row) => row.status === 'fulfilled');
    const rejected = outcomes.filter((row) => row.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: 'functions/already-exists' });
    expect(await appointmentCount()).toBe(1);
    expect((await slotDoc(openDay, '10:00').get()).get('appointmentId')).toBe(fulfilled[0].value.data.appointmentId);
  }, 90_000);

  it('rejects invalid, unavailable and out-of-window requests without writing anything', async () => {
    const cases = [
      [{ patient: { name: 'Synthetic', phone: newPhone(), consentToTreatment: false } }, 'functions/invalid-argument'],
      [{ patient: { name: 'Synthetic', phone: '12345', consentToTreatment: true } }, 'functions/invalid-argument'],
      [{ patient: { name: '', phone: newPhone(), consentToTreatment: true } }, 'functions/invalid-argument'],
      [{ clientRequestId: 'short' }, 'functions/invalid-argument'],
      [{ dateKey: '2026-1-1' }, 'functions/invalid-argument'],
      [{ time: '9:00' }, 'functions/invalid-argument'],
      [{ branchId: '' }, 'functions/invalid-argument'],
      [{ departmentId: 'dermatology' }, 'functions/failed-precondition'],
      [{ time: '08:00' }, 'functions/failed-precondition'],
      [{ dateKey: istKey(40) }, 'functions/failed-precondition'],
      [{ dateKey: istKey(-2) }, 'functions/failed-precondition'],
    ];
    for (const [patch, code] of cases) {
      await expect(createBooking(submission(patch))).rejects.toMatchObject({ code });
    }
    expect(await appointmentCount()).toBe(0);
    expect((await db.collection('appointmentSlots').get()).size).toBe(0);
    expect((await db.collection('auditLogs').get()).size).toBe(0);
  }, 120_000);

  it('refuses a closed clinic day that is closed after the availability read', async () => {
    await db.collection('scheduleExceptions').doc(`${DOCTOR}_${openDay}`).set({ type: 'closed', sessions: [] });
    await expect(createBooking(submission({ time: '09:00' }))).rejects.toMatchObject({ code: 'functions/failed-precondition' });
    expect(await appointmentCount()).toBe(0);
  }, 60_000);

  it('books, cancels staff-side releasing the slot, then rebooks the same time', async () => {
    const booked = await createBooking(submission({ time: '10:20' }));
    expect((await slotDoc(openDay, '10:20').get()).exists).toBe(true);

    await signInStaff('admin-booking', { role: 'admin' });
    await transitionAppointment({ appointmentId: booked.data.appointmentId, to: 'cancelled', reason: 'Synthetic cancellation' });
    expect((await db.collection('appointments').doc(booked.data.appointmentId).get()).get('status')).toBe('cancelled');
    expect((await slotDoc(openDay, '10:20').get()).exists).toBe(false);

    const rebooked = await createBooking(submission({ time: '10:20' }));
    expect(rebooked.data.idempotent).toBe(false);
    expect(rebooked.data.reference).not.toBe(booked.data.reference);
    expect(rebooked.data.status).toBe('scheduled');
    expect((await slotDoc(openDay, '10:20').get()).get('appointmentId')).toBe(rebooked.data.appointmentId);
  }, 120_000);

  it('enforces the two-active-appointments-per-phone cap', async () => {
    const phone = '+919812345678';
    for (const offset of [30, 60]) {
      await db.collection('appointments').doc().set({
        doctorId: DOCTOR,
        status: 'scheduled',
        phoneKey: phone,
        startsAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + offset * 60_000)),
        dateKey: openDay,
      });
    }
    await expect(createBooking(submission({ patient: { name: 'Synthetic', phone, consentToTreatment: true } })))
      .rejects.toMatchObject({ code: 'functions/resource-exhausted' });
    expect(await appointmentCount()).toBe(2);
  }, 60_000);

  it('throttles repeated attempts from one client after ten in the window', async () => {
    await db.collection('scheduleExceptions').doc(`${DOCTOR}_${openDay}`).set({ type: 'closed', sessions: [] });
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      await expect(createBooking(submission({ time: '09:00' }))).rejects.toMatchObject({ code: 'functions/failed-precondition' });
    }
    await expect(createBooking(submission({ time: '09:00' }))).rejects.toMatchObject({ code: 'functions/resource-exhausted' });
    expect(await appointmentCount()).toBe(0);
  }, 180_000);
  it('links an authenticated patient booking to that patient and never to the guest path', async () => {
    await signInPatient('patient-booker');
    const payload = submission({ time: '10:20' });
    const { data } = await createBooking(payload);

    const appointment = (await db.collection('appointments').doc(data.appointmentId).get()).data();
    expect(appointment).toMatchObject({
      patientId: 'patient-booker',
      source: 'patient_portal',
      phoneKey: payload.patient.phone,
      createdBy: { uid: 'patient-booker', role: 'patient' },
      consent: { actor: 'authenticated_patient' },
    });
    const audit = (await db.collection('auditLogs').where('action', '==', 'appointment_created').get()).docs[0].data();
    expect(audit.meta).toMatchObject({ source: 'patient_portal', guest: false, contact: 'patient_account' });
  }, 120_000);

  it('labels a guest booking as a guest in consent and in the audit row', async () => {
    await signOut(config.auth);
    const { data } = await createBooking(submission({ time: '11:00' }));

    const appointment = (await db.collection('appointments').doc(data.appointmentId).get()).data();
    expect(appointment).toMatchObject({
      patientId: null,
      source: 'web',
      createdBy: { uid: null, role: 'public' },
      consent: { version: 'booking-v1', actor: 'guest' },
    });
    const audit = (await db.collection('auditLogs').where('action', '==', 'appointment_created').get()).docs[0].data();
    expect(audit.meta).toMatchObject({ source: 'web', guest: true, contact: 'phone_and_email' });
  }, 90_000);

  it('classifies a guest who gave only a phone number as a phone contact', async () => {
    await signOut(config.auth);
    const phoneOnly = submission({ time: '11:20' });
    phoneOnly.patient = { ...phoneOnly.patient, email: '' };
    const { data } = await createBooking(phoneOnly);

    expect((await db.collection('appointments').doc(data.appointmentId).get()).get('patientSnapshot.email')).toBeNull();
    const audit = (await db.collection('auditLogs').where('action', '==', 'appointment_created').get()).docs[0].data();
    expect(audit.meta).toMatchObject({ guest: true, contact: 'phone' });
  }, 90_000);
});

// The reschedule success path needs the same catalogue/settings rows, so it runs in
// this harness rather than the auth+firestore-only callable suite.
suite('rescheduleAppointment success path', () => {
  const bookAt = async (time) => (await createBooking(submission({ time }))).data;
  const moveTo = (appointmentId, time) => rescheduleAppointment({ appointmentId, dateKey: openDay, time });

  it('moves an appointment to a free slot, releasing the old one atomically', async () => {
    const booked = await bookAt('09:00');
    await signInStaff('admin-reschedule', { role: 'admin' });
    const moved = await moveTo(booked.appointmentId, '10:40');
    expect(moved.data).toEqual({ ok: true, appointmentId: booked.appointmentId, dateKey: openDay, time: '10:40', status: 'scheduled' });

    const appointment = (await db.collection('appointments').doc(booked.appointmentId).get()).data();
    expect(appointment.dateKey).toBe(openDay);
    expect(appointment.slotIds).toEqual([`${DOCTOR}_${openDay.replaceAll('-', '')}_1040`]);
    expect(appointment.reference).toBe(booked.reference);
    expect(new Date(appointment.startsAt.toDate()).toISOString()).toBe(`${openDay}T05:10:00.000Z`);
    expect((await slotDoc(openDay, '09:00').get()).exists).toBe(false);
    expect((await slotDoc(openDay, '10:40').get()).get('appointmentId')).toBe(booked.appointmentId);

    const events = await db.collection('appointments').doc(booked.appointmentId).collection('events').get();
    expect(events.docs.map((doc) => doc.get('meta')).filter((meta) => meta?.action === 'rescheduled'))
      .toEqual([{ action: 'rescheduled', fromDateKey: openDay, toDateKey: openDay, toTime: '10:40' }]);
    const audits = await db.collection('auditLogs').where('action', '==', 'appointment_rescheduled').get();
    expect(audits.size).toBe(1);

    const availability = await getAvailability({ doctorId: DOCTOR, dateKey: openDay });
    const times = availability.data.slots.map((slot) => slot.time);
    expect(times).not.toContain('10:40');
    expect(times).toContain('09:00');
  }, 120_000);

  it('lets the own doctor move it and refuses a write that is not a free slot', async () => {
    const booked = await bookAt('09:20');
    await signInStaff('doctor-reschedule', { role: 'doctor', doctorId: DOCTOR });
    await expect(moveTo(booked.appointmentId, '08:00')).rejects.toMatchObject({ code: 'functions/failed-precondition' });
    await expect(moveTo(booked.appointmentId, '09:20')).rejects.toMatchObject({ code: 'functions/failed-precondition' });
    expect((await slotDoc(openDay, '09:20').get()).get('appointmentId')).toBe(booked.appointmentId);
    await expect(moveTo(booked.appointmentId, '11:00')).resolves.toMatchObject({ data: { time: '11:00' } });
  }, 120_000);

  it('refuses a slot another booking already holds and keeps the original slot', async () => {
    const first = await bookAt('09:40');
    const second = await bookAt('10:00');
    await signInStaff('admin-reschedule', { role: 'admin' });
    await expect(moveTo(second.appointmentId, '09:40')).rejects.toMatchObject({ code: 'functions/failed-precondition' });
    expect((await db.collection('appointments').doc(second.appointmentId).get()).get('slotIds'))
      .toEqual([`${DOCTOR}_${openDay.replaceAll('-', '')}_1000`]);
    expect((await slotDoc(openDay, '09:40').get()).get('appointmentId')).toBe(first.appointmentId);
  }, 120_000);
});
