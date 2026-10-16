const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

admin.initializeApp();
const db = admin.firestore();

const run = async () => {
  const configRef = db.collection('clinic').doc('publicConfig');
  const snapshot = await configRef.get();
  const data = snapshot.data() || {};
  const oldTypes = Array.isArray(data.visitTypes) ? data.visitTypes : [];
  const visitTypes = oldTypes.map((item, index) => ({
    id: item.id,
    label: item.label,
    slug: item.slug || item.id,
    description: item.description || '',
    mode: item.mode || 'in_person',
    minutes: item.minutes || data.slotMinutes || 20,
    bufferBeforeMinutes: data.bufferBeforeMinutes || 0,
    bufferAfterMinutes: data.bufferAfterMinutes || 0,
    minNoticeMinutes: data.leadMinutes || 30,
    maxAdvanceDays: data.bookingWindowDays || 14,
    intervalMinutes: data.intervalMinutes || item.minutes || 20,
    dailyLimit: null,
    requiresConfirmation: data.autoConfirm !== true,
    color: index % 2 ? 'green' : 'blue',
    doctorIds: [],
    intakeQuestions: [],
    pricePaise: null,
    active: item.active !== false,
    sortOrder: index,
  }));
  console.log(JSON.stringify({ count: visitTypes.length, apply: process.env.CLINIC_APPLY_VISIT_TYPE_MIGRATION === 'true' }));
  if (process.env.CLINIC_APPLY_VISIT_TYPE_MIGRATION !== 'true') return;
  const batch = db.batch();
  visitTypes.forEach((visitType) => batch.set(db.collection('visitTypes').doc(visitType.id), {
    ...visitType,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true }));
  await batch.commit();
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
