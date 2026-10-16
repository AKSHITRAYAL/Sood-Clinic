const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { validateVisitType } = require('../../lib/engine/visitType');

const db = admin.firestore();
const options = { region: 'asia-south1', enforceAppCheck: process.env.ENFORCE_APP_CHECK === 'true' };

const requireAdmin = (request) => {
  if (request.auth?.token?.forcePasswordChange === true || request.auth?.token?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Administrator access is required.');
  }
};

const cleanVisitType = (input, id) => {
  const value = {
    ...input,
    id,
    doctorIds: Array.isArray(input.doctorIds) ? [...new Set(input.doctorIds)] : [],
    intakeQuestions: Array.isArray(input.intakeQuestions) ? input.intakeQuestions : [],
    dailyLimit: input.dailyLimit === null || input.dailyLimit === undefined ? null : Number(input.dailyLimit),
    pricePaise: input.pricePaise === null || input.pricePaise === undefined ? null : Number(input.pricePaise),
    sortOrder: Number(input.sortOrder) || 0,
  };
  const result = validateVisitType(value);
  if (!result.ok) throw new HttpsError('invalid-argument', 'Visit type details are invalid.', { reason: 'VALIDATION', fields: result.errors });
  return value;
};

const publicVisitType = (data, id) => ({
  id,
  label: data.label,
  slug: data.slug,
  description: data.description || '',
  mode: data.mode,
  minutes: data.minutes,
  color: data.color,
  pricePaise: data.pricePaise,
  doctorIds: data.doctorIds || [],
  requiresConfirmation: data.requiresConfirmation === true,
  maxAdvanceDays: data.maxAdvanceDays,
  intakeQuestions: data.intakeQuestions || [],
});

const audit = (request, action, id) => db.collection('auditLogs').add({
  at: FieldValue.serverTimestamp(),
  actor: { uid: request.auth.uid, role: 'admin' },
  action,
  resource: { type: 'visit_type', id },
  meta: {},
});

const saveVisitType = onCall(options, async (request) => {
  requireAdmin(request);
  const id = String(request.data?.id || '').trim();
  if (!/^[a-z][a-z0-9-]{1,60}$/.test(id)) throw new HttpsError('invalid-argument', 'Visit type ID must be a lowercase slug.');
  const payload = cleanVisitType({ ...request.data, slug: request.data?.slug || id }, id);
  await db.collection('visitTypes').doc(id).set({
    ...payload,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    updatedBy: request.auth.uid,
  }, { merge: true });
  await audit(request, 'visit_type_saved', id);
  return { visitType: { ...payload, id } };
});

const listVisitTypes = onCall(options, async (request) => {
  requireAdmin(request);
  const snapshot = await db.collection('visitTypes').orderBy('sortOrder').get();
  if (snapshot.size) return { visitTypes: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) };
  const legacy = await db.collection('clinic').doc('publicConfig').get();
  const config = legacy.data() || {};
  const visitTypes = Array.isArray(config.visitTypes) ? config.visitTypes : [];
  return {
    visitTypes: visitTypes.map((item, sortOrder) => ({
      id: item.id,
      slug: item.slug || item.id,
      label: item.label,
      description: item.description || '',
      mode: item.mode || 'in_person',
      minutes: item.minutes || config.slotMinutes || 20,
      bufferBeforeMinutes: config.bufferBeforeMinutes || 0,
      bufferAfterMinutes: config.bufferAfterMinutes || 0,
      minNoticeMinutes: config.leadMinutes || 30,
      maxAdvanceDays: config.bookingWindowDays || 14,
      intervalMinutes: config.intervalMinutes || item.minutes || 20,
      dailyLimit: null,
      requiresConfirmation: config.autoConfirm !== true,
      color: 'blue',
      doctorIds: [],
      intakeQuestions: [],
      pricePaise: null,
      active: item.active !== false,
      sortOrder,
    })),
  };
});

module.exports = { listVisitTypes, saveVisitType, publicVisitType };
