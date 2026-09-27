const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

admin.initializeApp();
setGlobalOptions({ region: 'asia-south1', maxInstances: 10 });

const db = admin.firestore();
const app = express();
const allowedOrigins = ['https://sood-clinic.web.app', 'https://sood-clinic.firebaseapp.com', 'http://localhost:5174'];
app.disable('x-powered-by');
app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)) }));
app.use(express.json({ limit: '50kb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});

const fail = (res, status, message) => res.status(status).json({ error: { message } });
const minutes = (time) => {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return NaN;
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
};
const publicBranch = (doc) => ({ _id: doc.id, name: doc.get('name'), code: doc.get('code'), timezone: doc.get('timezone') || 'Asia/Kolkata' });

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'sood-clinic-api' }));
app.get('/api/v1/public/booking/branches', async (_req, res, next) => {
  try {
    const snapshot = await db.collection('branches').where('active', '==', true).orderBy('name').get();
    res.json({ data: snapshot.docs.map(publicBranch) });
  } catch (error) { next(error); }
});

app.get('/api/v1/public/booking/branches/:branchId/departments', async (req, res, next) => {
  try {
    const snapshot = await db.collection('departments').where('branchId', '==', req.params.branchId).where('active', '==', true).where('publicBookingEnabled', '==', true).orderBy('sortOrder').get();
    res.json({ data: snapshot.docs.map((doc) => ({ _id: doc.id, name: doc.get('name'), description: doc.get('description') || '' })) });
  } catch (error) { next(error); }
});

app.get('/api/v1/public/booking/branches/:branchId/departments/:departmentId/doctors', async (req, res, next) => {
  try {
    const snapshot = await db.collection('doctors').where('branchId', '==', req.params.branchId).where('departmentIds', 'array-contains', req.params.departmentId).where('active', '==', true).where('bookingEnabled', '==', true).get();
    res.json({ data: snapshot.docs.map((doc) => ({ id: doc.id, name: doc.get('name'), qualification: doc.get('qualification') || '', schedule: doc.get('weeklySchedule') || [] })) });
  } catch (error) { next(error); }
});

app.post('/api/v1/public/booking/appointments', async (req, res, next) => {
  try {
    const { branchId, departmentId, doctorId, startsAt, endsAt, patient, reason = '' } = req.body || {};
    if (!branchId || !departmentId || !doctorId || !startsAt || !endsAt || !patient?.name || !patient?.phone) return fail(res, 422, 'Please complete all required booking details.');
    if (!patient.consentToTreatment) return fail(res, 422, 'Consent to treatment is required to book an appointment.');
    const start = new Date(startsAt); const end = new Date(endsAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start || start <= new Date()) return fail(res, 422, 'Choose a future appointment time.');
    const [branch, department, doctor] = await Promise.all([db.collection('branches').doc(branchId).get(), db.collection('departments').doc(departmentId).get(), db.collection('doctors').doc(doctorId).get()]);
    if (!branch.exists || !branch.get('active') || !department.exists || department.get('branchId') !== branchId || !department.get('active') || !department.get('publicBookingEnabled') || !doctor.exists || doctor.get('branchId') !== branchId || !doctor.get('active') || !doctor.get('bookingEnabled') || !(doctor.get('departmentIds') || []).includes(departmentId)) return fail(res, 422, 'The selected clinic service is no longer available.');
    const schedule = (doctor.get('weeklySchedule') || []).find((rule) => rule.weekday === start.getDay() && minutes(rule.startTime) <= start.getHours() * 60 + start.getMinutes() && minutes(rule.endTime) >= end.getHours() * 60 + end.getMinutes());
    if (!schedule) return fail(res, 422, 'This doctor is not available at the selected time.');
    const appointmentRef = db.collection('appointments').doc();
    const slotRef = db.collection('appointmentSlots').doc(`${doctorId}_${start.toISOString()}`);
    const reference = `SC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    await db.runTransaction(async (transaction) => {
      if ((await transaction.get(slotRef)).exists) throw Object.assign(new Error('That appointment time is no longer available.'), { status: 409 });
      transaction.set(slotRef, { doctorId, startsAt: admin.firestore.Timestamp.fromDate(start), appointmentId: appointmentRef.id, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      transaction.set(appointmentRef, { reference, branchId, departmentId, doctorId, startsAt: admin.firestore.Timestamp.fromDate(start), endsAt: admin.firestore.Timestamp.fromDate(end), reason: String(reason).slice(0, 500), status: 'scheduled', source: 'patient_portal', patient: { name: String(patient.name).trim().slice(0, 120), phone: String(patient.phone).trim().slice(0, 30), gender: ['male', 'female', 'other'].includes(patient.gender) ? patient.gender : 'unknown', consentToTreatment: true }, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    });
    res.status(201).json({ data: { appointmentId: appointmentRef.id, reference, status: 'scheduled' } });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => { console.error(error); fail(res, error.status || 500, error.status ? error.message : 'Unable to process this request. Please try again later.'); });
exports.clinicApi = onRequest({ region: 'asia-south1', timeoutSeconds: 30, memory: '256MiB' }, app);
