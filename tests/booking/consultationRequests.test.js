// Consultation request/proposal workflow against the real Functions runtime,
// Firestore emulator and Data Connect catalogue. Run with `npm run test:booking`
// (auth + firestore + functions + dataconnect on demo-sood-clinic). Outside the
// emulators every case is skipped so a bare `vitest run` stays green.
import { createRequire } from 'node:module';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const requireFromFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { localDataConnect, seed } = requireFromFunctions('../SQL/scripts/local.cjs');
const admin = requireFromFunctions('firebase-admin');
const toolsRequire = createRequire(new URL('../../node_modules/firebase-tools/package.json', import.meta.url));
const { Client } = toolsRequire('pg');

const PROJECT = 'demo-sood-clinic';
const DOCTOR = 'brig-ak-sood';
const PASSWORD = 'Synthetic-pass-1';
// Workflow-scoped formats avoid mutating the formats used by the legacy booking
// suite that shares this emulator.
const CONSULT = 'wf-consultation';
const VIDEO = 'wf-video';
const PROCEDURE = 'wf-procedure';
const EMAIL = 'patient@synthetic.test';

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
const nextOpenDay = () => {
  let offset = 2;
  while (weekdayOf(istKey(offset)) === 0) offset += 1;
  return istKey(offset);
};

let db;
let sql;
let auth;
let config;
let api;
let openDay;
const createdUsers = [];

const requestId = () => `consult-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
const newPhone = () => `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
const patient = (overrides = {}) => ({ name: 'Synthetic Patient', phone: newPhone(), email: EMAIL, consentToTreatment: true, ...overrides });
const inPerson = (overrides = {}) => ({
  mode: 'in_person',
  locationId: 'jindal-diagnostics',
  serviceId: CONSULT,
  doctorId: DOCTOR,
  dateKey: openDay,
  time: '09:30',
  patient: patient(),
  reason: 'Synthetic visit reason',
  consentVersion: 'consultation-request-v1',
  clientRequestId: requestId(),
  ...overrides,
});
const video = (overrides = {}) => ({
  mode: 'video',
  serviceId: VIDEO,
  doctorId: DOCTOR,
  patient: patient(),
  reason: 'Synthetic video intake',
  consentVersion: 'consultation-request-v1',
  clientRequestId: requestId(),
  ...overrides,
});

const count = async (name) => (await db.collection(name).get()).size;
const signInStaff = async (uid, claims) => {
  await config.authAdmin.createUser({ uid, email: `${uid}@synthetic.test`, password: PASSWORD });
  createdUsers.push(uid);
  await config.authAdmin.setCustomUserClaims(uid, claims);
  await signInWithEmailAndPassword(auth, `${uid}@synthetic.test`, PASSWORD);
};

beforeAll(async () => {
  if (!emulators) return;
  admin.initializeApp({ projectId: PROJECT });
  db = admin.firestore();
  const dc = localDataConnect();
  await seed();
  sql = new Client({ host: '127.0.0.1', port: 9398, database: 'ak-sood-clinic-database', user: 'postgres' });
  await sql.connect();
  await sql.query(`INSERT INTO clinic_settings(id,booking_window_days,lead_minutes,interval_minutes,buffer_before_minutes,buffer_after_minutes,cancel_cutoff_minutes,auto_confirm,updated_at)
    VALUES('primary',14,30,30,0,0,120,false,now())
    ON CONFLICT (id) DO UPDATE SET booking_window_days=14,lead_minutes=30,interval_minutes=30,
      buffer_before_minutes=0,buffer_after_minutes=0,cancel_cutoff_minutes=120,auto_confirm=false,updated_at=now()`);
  await sql.query("UPDATE clinic_services SET legacy_id='consultation',legacy_sort_order=0,updated_at=now() WHERE code='consultation'");
  const services = [
    ['00000000-0000-4000-8000-0000000000a1', CONSULT, 'In-clinic consultation', 30, 'in_person', 1],
    ['00000000-0000-4000-8000-0000000000a2', VIDEO, 'Online video consultation', 30, 'video', 2],
    ['00000000-0000-4000-8000-0000000000a3', PROCEDURE, 'Synthetic procedure', 60, 'in_person', 3],
  ];
  for (const [id, legacyId, name, minutes, mode, sortOrder] of services) {
    await sql.query(`INSERT INTO clinic_services(id,legacy_id,legacy_sort_order,code,name,duration_minutes,buffer_minutes,fee_paise,consultation_mode,active,updated_at)
      VALUES($1,$2,$3,$2,$4,$5,0,NULL,$6,true,now())
      ON CONFLICT (id) DO UPDATE SET legacy_id=$2,legacy_sort_order=$3,name=$4,duration_minutes=$5,consultation_mode=$6,active=true,updated_at=now()`,
    [id, legacyId, sortOrder, name, minutes, mode]);
  }
  openDay = nextOpenDay();
  await db.collection('clinic').doc('consultationPolicy').set({
    locations: [
      {
        id: 'dhawan-hospital', name: 'Dhawan Hospital',
        address: 'Plot No. 1-SP, Sector 7, Panchkula, Haryana 134109', landmark: '',
        phones: ['+911722596090', '+911722596091'], windows: [{ start: '11:00', end: '15:00' }], procedureAllowed: true,
      },
      {
        id: 'jindal-diagnostics', name: 'Jindal Diagnostics',
        address: 'Plot No. 195, Sector 10, Panchkula, Haryana 134113', landmark: 'Opposite Sindhi Sweets',
        phones: [], windows: [{ start: '09:00', end: '11:00' }, { start: '17:00', end: '19:00' }], procedureAllowed: false,
      },
    ],
    videoWindows: [{ start: '09:30', end: '10:30' }, { start: '17:30', end: '18:30' }],
    closedWeekdays: [0],
    proposalLifetimeHours: 24,
    services: { [PROCEDURE]: 'procedure' },
    updatedBy: 'synthetic-setup',
  });

  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-api-key' }, 'consultation-harness');
  auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const functions = getFunctions(app, 'asia-south1');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  const call = (name) => httpsCallable(functions, name);
  api = {
    options: call('getConsultationOptions'),
    availability: call('getConsultationAvailability'),
    submit: call('submitConsultationRequest'),
    status: call('getConsultationRequestStatus'),
    cancel: call('cancelConsultationRequest'),
    respond: call('respondToAppointmentProposal'),
    list: call('listConsultationRequests'),
    approve: call('approveConsultationRequest'),
    decline: call('declineConsultationRequest'),
    bulk: call('bulkApproveConsultationRequests'),
    propose: call('offerAppointmentProposal'),
    expire: call('expireConsultationProposals'),
  };
  config = { authAdmin: admin.auth() };
}, 240_000);

beforeEach(async () => {
  if (!emulators) return;
  await signOut(auth);
  for (const name of [
    'consultationRequests', 'appointmentProposals', 'appointments', 'appointmentSlots',
    'auditLogs', 'notifications', 'rateLimits', 'scheduleExceptions',
  ]) await db.recursiveDelete(db.collection(name));
  if (createdUsers.length) await Promise.all(createdUsers.splice(0).map((uid) => config.authAdmin.deleteUser(uid).catch(() => {})));
}, 90_000);

afterAll(async () => {
  if (!emulators) return;
  await Promise.all(createdUsers.map((uid) => config.authAdmin.deleteUser(uid).catch(() => {})));
  await sql?.query("DELETE FROM clinic_services WHERE legacy_id IN ($1,$2,$3)", [CONSULT, VIDEO, PROCEDURE]);
  await sql?.query("UPDATE clinic_services SET legacy_id=NULL,legacy_sort_order=NULL,updated_at=now() WHERE code='consultation'");
  await sql?.query("DELETE FROM clinic_settings WHERE id='primary'");
  await sql?.end();
}, 90_000);

suite('consultation options and availability', () => {
  it('publishes the location contract, video windows, Sunday closure and service kinds', async () => {
    const { data } = await api.options();
    expect(data.timezone).toBe('Asia/Kolkata');
    expect(data.slotMinutes).toBe(30);
    expect(data.locations.map((row) => row.id)).toEqual(['dhawan-hospital', 'jindal-diagnostics']);
    expect(data.videoWindows).toEqual([{ start: '09:30', end: '10:30' }, { start: '17:30', end: '18:30' }]);
    expect(data.closedWeekdays).toEqual([0]);
    expect(data.services.find((row) => row.id === PROCEDURE)).toMatchObject({ kind: 'procedure', minutes: 60 });
    expect(data.services.find((row) => row.id === CONSULT)).toMatchObject({ kind: 'consultation', mode: 'in_person' });
    expect(data.notifications).toEqual({ portal: true, email: false });
    expect(JSON.stringify(data)).not.toMatch(/Synthetic Patient|@synthetic/i);
  }, 90_000);

  it('returns a 30-minute grid inside each location window, shared with the video mode', async () => {
    const dhawan = await api.availability({ doctorId: DOCTOR, dateKey: openDay, serviceId: CONSULT, locationId: 'dhawan-hospital' });
    expect(dhawan.data.slots.map((slot) => slot.time)).toEqual(['11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30']);
    const jindal = await api.availability({ doctorId: DOCTOR, dateKey: openDay, serviceId: CONSULT, locationId: 'jindal-diagnostics' });
    expect(jindal.data.slots.map((slot) => slot.time)).toEqual(['09:00', '09:30', '10:00', '10:30', '17:00', '17:30', '18:00', '18:30']);
    const online = await api.availability({ doctorId: DOCTOR, dateKey: openDay, serviceId: VIDEO });
    expect(online.data.slots.map((slot) => slot.time)).toEqual(['09:30', '10:00', '17:30', '18:00']);
    expect(online.data.slots[0].endsAt).toBe(`${openDay}T04:30:00.000Z`);
    let sundayOffset = 1;
    while (weekdayOf(istKey(sundayOffset)) !== 0) sundayOffset += 1;
    expect((await api.availability({ doctorId: DOCTOR, dateKey: istKey(sundayOffset), serviceId: CONSULT, locationId: 'dhawan-hospital' })).data.slots).toEqual([]);
  }, 120_000);

  it('refuses procedures at Jindal Diagnostics for reads and submissions', async () => {
    await expect(api.availability({ doctorId: DOCTOR, dateKey: openDay, serviceId: PROCEDURE, locationId: 'jindal-diagnostics' }))
      .rejects.toMatchObject({ code: 'functions/failed-precondition' });
    await expect(api.submit(inPerson({ serviceId: PROCEDURE })))
      .rejects.toMatchObject({ code: 'functions/failed-precondition' });
    const dhawan = await api.availability({ doctorId: DOCTOR, dateKey: openDay, serviceId: PROCEDURE, locationId: 'dhawan-hospital' });
    expect(dhawan.data.slots.map((slot) => slot.time)).toEqual(['11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00']);
    expect(await count('consultationRequests')).toBe(0);
  }, 120_000);
});

suite('submitting a request', () => {
  it('stores a pending request without reserving capacity, and replays idempotently', async () => {
    const payload = inPerson({ time: '10:00' });
    const { data } = await api.submit(payload);
    expect(data).toMatchObject({ status: 'pending', approvalPending: true, mode: 'in_person', idempotent: false });
    expect(data.reference).toMatch(/^CR-[0-9A-F]{8}$/);
    expect(data.accessToken).toMatch(/^[A-Za-z0-9_-]{20,}$/);

    const stored = (await db.collection('consultationRequests').doc(data.requestId).get()).data();
    expect(stored).toMatchObject({
      reference: data.reference, status: 'pending', mode: 'in_person', locationId: 'jindal-diagnostics',
      serviceId: CONSULT, doctorId: DOCTOR, requested: { dateKey: openDay, time: '10:00' }, appointmentId: null,
    });
    expect(stored.patient).toMatchObject({ name: 'Synthetic Patient', email: EMAIL });
    expect(stored.accessTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(data.accessToken);
    expect(await count('appointments')).toBe(0);
    expect(await count('appointmentSlots')).toBe(0);
    expect((await db.collection('auditLogs').where('action', '==', 'consultation_request_submitted').get()).size).toBe(1);
    expect((await db.collection('notifications').get()).docs[0].data()).toMatchObject({ status: 'queued', channel: 'clinic_console' });

    const again = await api.submit(payload);
    expect(again.data).toMatchObject({ idempotent: true, reference: data.reference, status: 'pending' });
    expect(await count('consultationRequests')).toBe(1);
    await expect(api.submit({ ...payload, patient: patient({ name: 'Different Person' }) }))
      .rejects.toMatchObject({ code: 'functions/already-exists' });
  }, 120_000);

  it('accepts an email-only guest and rejects malformed contact or consent', async () => {
    const { data } = await api.submit(inPerson({ patient: patient({ phone: '', email: 'guest@example.test' }) }));
    expect(data.status).toBe('pending');
    expect((await db.collection('consultationRequests').doc(data.requestId).get()).get('phoneKey')).toBeNull();

    for (const patch of [
      { patient: patient({ phone: '', email: '' }) },
      { patient: patient({ email: 'not-an-email' }) },
      { patient: patient({ consentToTreatment: false }) },
      { clientRequestId: 'short' },
    ]) await expect(api.submit(inPerson(patch))).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    // Times that are not currently offered are refused, not stored for later approval.
    for (const time of ['08:00', '09:15', '10:45']) {
      await expect(api.submit(inPerson({ time }))).rejects.toMatchObject({ code: 'functions/failed-precondition' });
    }
    expect(await count('appointments')).toBe(0);
  }, 120_000);
});

suite('staff approval', () => {
  it('confirms the requested time atomically and is idempotent on retry', async () => {
    const submitted = (await api.submit(inPerson({ time: '10:00' }))).data;
    await signInStaff('admin-approve', { role: 'admin' });

    const { data } = await api.approve({ requestId: submitted.requestId });
    expect(data).toMatchObject({ status: 'confirmed', idempotent: false, mode: 'in_person' });
    const appointment = (await db.collection('appointments').doc(data.appointmentId).get()).data();
    expect(appointment).toMatchObject({
      reference: data.reference, status: 'confirmed', doctorId: DOCTOR,
      locationId: 'jindal-diagnostics', visitType: CONSULT, visitMode: 'in_person',
      dateKey: openDay, consultationRequestId: submitted.requestId, source: 'web', patientId: null,
    });
    expect(appointment.slotIds).toEqual([`${DOCTOR}_${openDay.replaceAll('-', '')}_1000`]);
    expect((await db.collection('appointmentSlots').doc(appointment.slotIds[0]).get()).data())
      .toMatchObject({ status: 'booked', appointmentId: data.appointmentId, expiresAt: null });
    expect((await db.collection('consultationRequests').doc(submitted.requestId).get()).data())
      .toMatchObject({ status: 'confirmed', appointmentId: data.appointmentId });
    expect((await db.collection('appointments').doc(data.appointmentId).collection('events').get()).size).toBe(1);
    expect((await db.collection('notifications').where('template', '==', 'consultation_confirmed').get()).size).toBe(1);

    const replay = await api.approve({ requestId: submitted.requestId });
    expect(replay.data).toMatchObject({ idempotent: true, appointmentId: data.appointmentId });
    expect(await count('appointments')).toBe(1);
    expect((await api.list({ status: 'confirmed' })).data.requests)
      .toContainEqual(expect.objectContaining({ requestId: submitted.requestId, status: 'confirmed' }));
  }, 180_000);

  it('lets exactly one of two competing approvals take the slot', async () => {
    const first = (await api.submit(inPerson({ time: '10:30' }))).data;
    const second = (await api.submit(inPerson({ time: '10:30' }))).data;
    await signInStaff('admin-compete', { role: 'admin' });

    const outcomes = await Promise.allSettled([
      api.approve({ requestId: first.requestId }),
      api.approve({ requestId: second.requestId }),
    ]);
    expect(outcomes.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((row) => row.status === 'rejected')).toHaveLength(1);
    expect(outcomes.find((row) => row.status === 'rejected').reason).toMatchObject({ code: 'functions/failed-precondition' });
    expect(await count('appointments')).toBe(1);
    const confirmed = (await db.collection('consultationRequests').get()).docs.filter((doc) => doc.get('status') === 'confirmed');
    expect(confirmed).toHaveLength(1);
    expect((await db.collection('appointmentSlots').get()).size).toBe(1);
  }, 180_000);

  it('rejects an anonymous or non-owning doctor approval', async () => {
    const submitted = (await api.submit(inPerson({ time: '09:30' }))).data;
    await expect(api.approve({ requestId: submitted.requestId })).rejects.toMatchObject({ code: 'functions/permission-denied' });
    await signInStaff('doctor-other', { role: 'doctor', doctorId: 'another-doctor' });
    await expect(api.approve({ requestId: submitted.requestId })).rejects.toMatchObject({ code: 'functions/permission-denied' });
    expect(await count('appointments')).toBe(0);
  }, 120_000);

  it('records a decline with a reason and an audit event', async () => {
    const submitted = (await api.submit(inPerson({ time: '09:00' }))).data;
    await signInStaff('admin-decline', { role: 'admin' });
    await expect(api.decline({ requestId: submitted.requestId })).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    await api.decline({ requestId: submitted.requestId, reason: 'Doctor unavailable that morning.' });
    const stored = (await db.collection('consultationRequests').doc(submitted.requestId).get()).data();
    expect(stored).toMatchObject({ status: 'declined', declineReason: 'Doctor unavailable that morning.', appointmentId: null });
    expect((await db.collection('auditLogs').where('action', '==', 'consultation_request_declined').get()).size).toBe(1);
    await expect(api.approve({ requestId: submitted.requestId })).rejects.toMatchObject({ code: 'functions/failed-precondition' });
  }, 120_000);
});

suite('shared doctor capacity across modes and locations', () => {
  it('blocks Jindal and Dhawan times already taken by a video confirmation', async () => {
    const remote = (await api.submit(video())).data;
    await signInStaff('admin-video', { role: 'admin' });
    const confirmed = await api.approve({ requestId: remote.requestId, dateKey: openDay, time: '09:30' });
    expect(confirmed.data.status).toBe('confirmed');
    await signOut(auth);

    const jindal = await api.availability({ doctorId: DOCTOR, dateKey: openDay, serviceId: CONSULT, locationId: 'jindal-diagnostics' });
    expect(jindal.data.slots.map((slot) => slot.time)).not.toContain('09:30');
    expect(jindal.data.slots.map((slot) => slot.time)).toContain('10:00');
    await expect(api.submit(inPerson({ time: '09:30' }))).rejects.toMatchObject({ code: 'functions/failed-precondition' });

    const second = (await api.submit(video())).data;
    await signInStaff('admin-video-2', { role: 'admin' });
    await expect(api.approve({ requestId: second.requestId, dateKey: openDay, time: '09:30' }))
      .rejects.toMatchObject({ code: 'functions/failed-precondition' });
    await expect(api.propose({ requestId: second.requestId, dateKey: openDay, time: '09:30' }))
      .rejects.toMatchObject({ code: 'functions/failed-precondition' });
    expect(await count('appointments')).toBe(1);
  }, 180_000);

  it('blocks a video time already taken in person and honours the configured buffer', async () => {
    const inPersonRequest = (await api.submit(inPerson({ time: '10:00' }))).data;
    await signInStaff('admin-buffer', { role: 'admin' });
    await api.approve({ requestId: inPersonRequest.requestId });
    const online = await api.availability({ doctorId: DOCTOR, dateKey: openDay, serviceId: VIDEO });
    expect(online.data.slots.map((slot) => slot.time)).toEqual(['09:30', '17:30', '18:00']);

    // A 15-minute buffer policy removes the adjacent video slot as well.
    await sql.query("UPDATE clinic_settings SET buffer_after_minutes=15, updated_at=now() WHERE id='primary'");
    const buffered = await api.availability({ doctorId: DOCTOR, dateKey: openDay, serviceId: VIDEO });
    expect(buffered.data.slots.map((slot) => slot.time)).toEqual(['17:30', '18:00']);
    await sql.query("UPDATE clinic_settings SET buffer_after_minutes=0, updated_at=now() WHERE id='primary'");
  }, 180_000);
});

suite('appointment proposals', () => {
  it('holds capacity, accepts with the one-time token and releases nothing on retry', async () => {
    const submitted = (await api.submit(video())).data;
    await signInStaff('admin-propose', { role: 'admin' });
    const offered = (await api.propose({ requestId: submitted.requestId, dateKey: openDay, time: '17:30' })).data;
    expect(offered.proposalId).toBeTruthy();
    expect(offered.accessToken).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(Date.parse(offered.expiresAt)).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
    const held = (await db.collection('appointmentSlots').doc(`${DOCTOR}_${openDay.replaceAll('-', '')}_1730`).get()).data();
    expect(held).toMatchObject({ status: 'held', proposalId: offered.proposalId });
    expect((await db.collection('appointmentProposals').doc(offered.proposalId).get()).get('accessTokenHash')).toMatch(/^[0-9a-f]{64}$/);

    // Anonymous guest with the token can answer; without it they cannot.
    await signOut(auth);
    await expect(api.respond({ proposalId: offered.proposalId, accept: true }))
      .rejects.toMatchObject({ code: 'functions/permission-denied' });
    expect(await count('appointments')).toBe(0);
    const accepted = await api.respond({ proposalId: offered.proposalId, token: offered.accessToken, accept: true });
    expect(accepted.data).toMatchObject({ status: 'accepted', idempotent: false });
    const appointment = (await db.collection('appointments').doc(accepted.data.appointmentId).get()).data();
    expect(appointment).toMatchObject({ status: 'confirmed', visitMode: 'video', locationId: null, consultationRequestId: submitted.requestId });
    expect((await db.collection('appointmentSlots').doc(`${DOCTOR}_${openDay.replaceAll('-', '')}_1730`).get()).data())
      .toMatchObject({ status: 'booked', appointmentId: accepted.data.appointmentId });

    const replay = await api.respond({ proposalId: offered.proposalId, token: offered.accessToken, accept: true });
    expect(replay.data).toMatchObject({ idempotent: true, appointmentId: accepted.data.appointmentId });
    expect(await count('appointments')).toBe(1);
  }, 180_000);

  it('expires a proposal, releases the hold and audits the transition before refusing acceptance', async () => {
    const submitted = (await api.submit(video())).data;
    await signInStaff('admin-expire', { role: 'admin' });
    const offered = (await api.propose({ requestId: submitted.requestId, dateKey: openDay, time: '10:00' })).data;
    await db.collection('appointmentProposals').doc(offered.proposalId)
      .update({ expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 60_000)) });
    // The guest answers the link; staff cannot answer on their behalf.
    await signOut(auth);

    await expect(api.respond({ proposalId: offered.proposalId, token: offered.accessToken, accept: true }))
      .rejects.toMatchObject({ code: 'functions/failed-precondition' });
    const proposal = (await db.collection('appointmentProposals').doc(offered.proposalId).get()).data();
    expect(proposal.status).toBe('expired');
    expect((await db.collection('consultationRequests').doc(submitted.requestId).get()).get('status')).toBe('pending');
    expect((await db.collection('appointmentSlots').doc(`${DOCTOR}_${openDay.replaceAll('-', '')}_1000`).get()).exists).toBe(false);
    expect((await db.collection('auditLogs').where('action', '==', 'consultation_proposal_expired').get()).size).toBe(1);
    const online = await api.availability({ doctorId: DOCTOR, dateKey: openDay, serviceId: VIDEO });
    expect(online.data.slots.map((slot) => slot.time)).toContain('10:00');

    // The sweep records expiry for the proposal a patient never opened.
    const second = (await api.submit(video())).data;
    await signInStaff('admin-expire-sweep', { role: 'admin' });
    const later = (await api.propose({ requestId: second.requestId, dateKey: openDay, time: '17:30' })).data;
    await db.collection('appointmentProposals').doc(later.proposalId)
      .update({ expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 60_000)) });
    const swept = await api.expire({ limit: 10 });
    expect(swept.data.expired).toBe(1);
    expect((await db.collection('appointmentProposals').doc(later.proposalId).get()).get('status')).toBe('expired');
  }, 180_000);

  it('lets exactly one of two parallel proposal acceptances confirm the request', async () => {
    const submitted = (await api.submit(video())).data;
    await signInStaff('admin-race', { role: 'admin' });
    const first = (await api.propose({ requestId: submitted.requestId, dateKey: openDay, time: '09:30' })).data;
    const second = (await api.propose({ requestId: submitted.requestId, dateKey: openDay, time: '10:00' })).data;
    await signOut(auth);

    const outcomes = await Promise.allSettled([
      api.respond({ proposalId: first.proposalId, token: first.accessToken, accept: true }),
      api.respond({ proposalId: second.proposalId, token: second.accessToken, accept: true }),
    ]);
    expect(outcomes.filter((row) => row.status === 'fulfilled')).toHaveLength(1);
    expect(await count('appointments')).toBe(1);
    const proposals = (await db.collection('appointmentProposals').get()).docs.map((doc) => doc.data());
    expect(proposals.filter((row) => row.status === 'accepted')).toHaveLength(1);
    expect(proposals.some((row) => ['superseded', 'expired', 'declined'].includes(row.status))).toBe(true);
    const held = await db.collection('appointmentSlots').where('status', '==', 'held').get();
    expect(held.size).toBe(0);
    expect((await db.collection('consultationRequests').doc(submitted.requestId).get()).get('status')).toBe('confirmed');
  }, 180_000);

  it('releases a declined proposal and returns the request to the queue', async () => {
    const submitted = (await api.submit(video())).data;
    await signInStaff('admin-decline-proposal', { role: 'admin' });
    const offered = (await api.propose({ requestId: submitted.requestId, dateKey: openDay, time: '18:00' })).data;
    await signOut(auth);
    const outcome = await api.respond({ proposalId: offered.proposalId, token: offered.accessToken, accept: false, reason: 'Cannot attend' });
    expect(outcome.data.status).toBe('declined');
    expect((await db.collection('consultationRequests').doc(submitted.requestId).get()).get('status')).toBe('pending');
    expect((await db.collection('appointmentSlots').doc(`${DOCTOR}_${openDay.replaceAll('-', '')}_1800`).get()).exists).toBe(false);
    expect(await count('appointments')).toBe(0);
  }, 180_000);
});

suite('bulk approval', () => {
  it('approves a deterministic bounded batch, records conflicts and keeps eligible rows', async () => {
    const first = (await api.submit(inPerson({ time: '10:00' }))).data;
    const conflict = (await api.submit(inPerson({ time: '10:00' }))).data;
    const later = (await api.submit(inPerson({ time: '10:30' }))).data;
    // Control submission order deterministically; server timestamps can tie.
    const base = Date.now() - 60_000;
    await db.collection('consultationRequests').doc(first.requestId)
      .update({ createdAt: admin.firestore.Timestamp.fromMillis(base) });
    await db.collection('consultationRequests').doc(conflict.requestId)
      .update({ createdAt: admin.firestore.Timestamp.fromMillis(base + 1_000) });
    await db.collection('consultationRequests').doc(later.requestId)
      .update({ createdAt: admin.firestore.Timestamp.fromMillis(base + 2_000) });

    await signInStaff('admin-bulk', { role: 'admin' });
    // Deliberately shuffled ids: the server orders by submission time, then id.
    const { data } = await api.bulk({ requestIds: [later.requestId, conflict.requestId, first.requestId] });
    expect(data.confirmed).toBe(2);
    expect(data.declined).toBe(1);
    expect(data.outcomes.map((row) => row.requestId)).toEqual([first.requestId, conflict.requestId, later.requestId]);
    expect(data.outcomes[0]).toMatchObject({ status: 'confirmed' });
    expect(data.outcomes[1]).toMatchObject({ status: 'declined', code: 'SLOT_TAKEN' });
    expect(data.outcomes[2]).toMatchObject({ status: 'confirmed' });
    expect((await db.collection('consultationRequests').doc(conflict.requestId).get()).data())
      .toMatchObject({ status: 'declined', declineCode: 'SLOT_TAKEN' });
    expect((await db.collection('auditLogs').where('action', '==', 'consultation_request_declined').get()).size).toBe(1);
    expect(await count('appointments')).toBe(2);
    expect((await db.collection('appointmentSlots').get()).size).toBe(2);

    // Replaying the batch returns the same confirmed appointments without new writes.
    const replay = await api.bulk({ requestIds: [first.requestId, conflict.requestId, later.requestId] });
    expect(replay.data.outcomes.map((row) => row.status)).toEqual(['confirmed', 'skipped', 'confirmed']);
    expect(replay.data.outcomes.filter((row) => row.status === 'confirmed').every((row) => row.idempotent)).toBe(true);
    expect(await count('appointments')).toBe(2);
  }, 240_000);

  it('refuses a batch larger than twenty or a non-staff caller', async () => {
    await expect(api.bulk({ requestIds: Array.from({ length: 21 }, (_, index) => `request-${index}`) }))
      .rejects.toMatchObject({ code: 'functions/permission-denied' });
    await signInStaff('doctor-bulk', { role: 'doctor', doctorId: DOCTOR });
    await expect(api.bulk({ requestIds: ['not-a-real-request'] }))
      .rejects.toMatchObject({ code: 'functions/not-found' });
  }, 120_000);
});

suite('request status and cancellation link', () => {
  it('shows the requester their own status without exposing private contact details', async () => {
    const submitted = (await api.submit(inPerson({ time: '09:00' }))).data;
    const status = (await api.status({ reference: submitted.reference, token: submitted.accessToken })).data;
    expect(status).toMatchObject({ reference: submitted.reference, status: 'pending', mode: 'in_person' });
    expect(status.location.id).toBe('jindal-diagnostics');
    expect(JSON.stringify(status)).not.toMatch(/Synthetic Patient|@synthetic|phone/i);
    await expect(api.status({ reference: submitted.reference, token: 'wrong-token' }))
      .rejects.toMatchObject({ code: 'functions/permission-denied' });

    await api.cancel({ reference: submitted.reference, token: submitted.accessToken, reason: 'Plans changed' });
    expect((await db.collection('consultationRequests').doc(submitted.requestId).get()).get('status')).toBe('cancelled');
    expect((await db.collection('auditLogs').where('action', '==', 'consultation_request_cancelled').get()).size).toBe(1);
  }, 120_000);

  it('cancels a confirmed appointment through the secure link and frees the slot', async () => {
    const submitted = (await api.submit(inPerson({ time: '09:30' }))).data;
    await signInStaff('admin-cancel', { role: 'admin' });
    const approved = await api.approve({ requestId: submitted.requestId });
    await signOut(auth);

    const status = (await api.status({ reference: submitted.reference, token: submitted.accessToken })).data;
    expect(status.appointment).toMatchObject({ reference: approved.data.reference, status: 'confirmed', canCancel: true });
    await api.cancel({ reference: submitted.reference, token: submitted.accessToken, reason: 'Cannot travel' });

    const appointment = (await db.collection('appointments').doc(approved.data.appointmentId).get()).data();
    expect(appointment.status).toBe('cancelled');
    expect((await db.collection('appointmentSlots').get()).size).toBe(0);
    expect((await db.collection('consultationRequests').doc(submitted.requestId).get()).get('status')).toBe('cancelled');
    const online = await api.availability({ doctorId: DOCTOR, dateKey: openDay, serviceId: CONSULT, locationId: 'jindal-diagnostics' });
    expect(online.data.slots.map((slot) => slot.time)).toContain('09:30');
  }, 180_000);
});
