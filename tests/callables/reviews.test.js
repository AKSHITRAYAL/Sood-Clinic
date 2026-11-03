import { createRequire } from 'node:module';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
const suite = process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST ? describe : describe.skip;
let app; let db; let auth; let functions;
const ids = []; const users = [];
const call = async (name, data = {}) => (await httpsCallable(functions, name)(data)).data;
async function login(role = 'patient') {
  const uid = `review-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `${uid}@synthetic.test`;
  await admin.auth().createUser({ uid, email, password: 'Synthetic-pass-1' }); users.push(uid);
  if (role !== 'patient') await admin.auth().setCustomUserClaims(uid, { role });
  await signInWithEmailAndPassword(auth, email, 'Synthetic-pass-1'); return uid;
}
async function submit(patch = {}) {
  const uid = await login(); const id = `visit-${uid}`; ids.push(id);
  await db.collection('appointments').doc(id).set({ patientId: uid, status: 'completed', startsAt: admin.firestore.Timestamp.now() });
  await call('submitPatientFeedback', { appointmentId: id, rating: 4, comment: 'The consultation was clearly explained.', publicConsent: true, ...patch });
  return { id, uid };
}
beforeAll(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) return;
  admin.initializeApp({ projectId: 'demo-sood-clinic' }); db = admin.firestore();
  app = initializeApp({ projectId: 'demo-sood-clinic', apiKey: 'demo-key' }, 'review-tests');
  auth = getAuth(app); connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  functions = getFunctions(app, 'asia-south1'); connectFunctionsEmulator(functions, '127.0.0.1', 5001);
});
afterAll(async () => {
  if (!db) return;
  await Promise.all(ids.map(async id => { await db.recursiveDelete(db.collection('patientFeedback').doc(id)); await db.collection('appointments').doc(id).delete(); }));
  await Promise.all(users.map(uid => admin.auth().deleteUser(uid))); await deleteApp(app); await admin.app().delete();
});
suite('verified patient reviews', () => {
  it('requires a completed owned appointment and rejects invalid ratings and excessive text', async () => {
    await login();
    await expect(call('submitPatientFeedback', { appointmentId: 'missing', rating: 5, comment: 'A detailed review.', publicConsent: true })).rejects.toMatchObject({ code: 'functions/permission-denied' });
    for (const patch of [{ rating: 6 }, { comment: 'x'.repeat(2001) }, { publicConsent: 'true' }]) {
      await expect(call('submitPatientFeedback', { appointmentId: 'missing', rating: 5, comment: 'A detailed review.', publicConsent: true, ...patch })).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    }
  }, 30_000);
  it('keeps private feedback private even when a manager tries to publish it', async () => {
    const { id } = await submit({ publicConsent: false }); await login('manager');
    await expect(call('moderatePatientFeedback', { feedbackId: id, action: 'publish', version: 1 })).rejects.toMatchObject({ code: 'functions/failed-precondition' });
    expect((await db.collection('patientFeedback').doc(id).get()).get('status')).toBe('unpublished');
  }, 30_000);
  it('publishes low ratings, projects no private identifiers, and includes them in the distribution', async () => {
    const { id } = await submit({ rating: 1 }); await login('manager');
    await call('moderatePatientFeedback', { feedbackId: id, action: 'publish', version: 1 }); await signOut(auth);
    const page = await call('listPatientReviews', { rating: 1 });
    const row = page.reviews.find(r => r.id === id); expect(row.rating).toBe(1); expect(row.verifiedVisit).toBe(true);
    for (const key of ['patientId', 'appointmentId', 'reviewedBy', 'originalComment', 'reports']) expect(row).not.toHaveProperty(key);
    expect(page.summary.distribution[1]).toBeGreaterThanOrEqual(1);
  }, 30_000);
  it('preserves original words, audits privacy redaction, replies and features only published reviews', async () => {
    const { id } = await submit(); await login('admin');
    await call('moderatePatientFeedback', { feedbackId: id, action: 'redact', version: 1, comment: 'The consultation was explained.', reason: 'Remove identifying detail' });
    await call('moderatePatientFeedback', { feedbackId: id, action: 'publish', version: 2 });
    await call('moderatePatientFeedback', { feedbackId: id, action: 'reply', version: 3, reply: 'Thank you for your feedback.' });
    await call('moderatePatientFeedback', { feedbackId: id, action: 'feature', version: 4, rank: 1 });
    const raw = await db.collection('patientFeedback').doc(id).get();
    expect(raw.get('comment')).toBe('The consultation was clearly explained.'); expect(raw.get('rating')).toBe(4);
    expect((await raw.ref.collection('history').get()).size).toBe(5);
    const result = await call('listPatientReviews'); const row = result.featured.find(r => r.id === id);
    expect(row.privacyEdited).toBe(true); expect(row.reply.text).toContain('Thank you');
    await expect(call('moderatePatientFeedback', { feedbackId: id, action: 'reply', version: 1, reply: 'Stale write' })).rejects.toMatchObject({ code: 'functions/aborted' });
  }, 30_000);
  it('allows only the author to edit or withdraw, requeues edits and removes withdrawn reviews from public results', async () => {
    const { id, uid } = await submit(); await login('manager');
    await call('moderatePatientFeedback', { feedbackId: id, action: 'publish', version: 1 });
    await expect(call('withdrawPatientFeedback', { feedbackId: id, version: 2 })).rejects.toMatchObject({ code: 'functions/permission-denied' });
    await signInWithEmailAndPassword(auth, `${uid}@synthetic.test`, 'Synthetic-pass-1');
    await call('submitPatientFeedback', { appointmentId: id, rating: 3, comment: 'Updated after reflecting on my visit.', publicConsent: true, version: 2 });
    expect((await db.collection('patientFeedback').doc(id).get()).get('status')).toBe('published');
    await call('withdrawPatientFeedback', { feedbackId: id, version: 3 });
    expect((await call('listPatientReviews')).reviews.some(r => r.id === id)).toBe(false);
  }, 30_000);
  it('deduplicates helpful votes and reports and keeps reports private', async () => {
    const { id } = await submit(); await login('manager'); await call('moderatePatientFeedback', { feedbackId: id, action: 'publish', version: 1 });
    await login();
    await Promise.all([call('interactWithReview', { feedbackId: id, action: 'helpful', helpful: true }), call('interactWithReview', { feedbackId: id, action: 'helpful', helpful: true })]);
    expect((await db.collection('patientFeedback').doc(id).get()).get('helpfulCount')).toBe(1);
    await call('interactWithReview', { feedbackId: id, action: 'helpful', helpful: false });
    await Promise.all([call('interactWithReview', { feedbackId: id, action: 'report', category: 'privacy', reason: 'Contains identifying information.' }), call('interactWithReview', { feedbackId: id, action: 'report', category: 'privacy', reason: 'Contains identifying information.' })]);
    const raw = await db.collection('patientFeedback').doc(id).get(); expect(raw.get('helpfulCount')).toBe(0); expect(raw.get('reportCount')).toBe(1);
    await expect(call('getFeedbackModerationQueue')).rejects.toMatchObject({ code: 'functions/permission-denied' });
    await login('manager'); const detail = await call('getReviewModerationDetail', { feedbackId: id }); expect(detail.reports).toHaveLength(1);
  }, 30_000);
  it('enforces current staff authorization and denies doctors from moderation', async () => {
    const uid = await login('manager'); await call('getFeedbackModerationQueue');
    await admin.auth().setCustomUserClaims(uid, {});
    await expect(call('getFeedbackModerationQueue')).rejects.toMatchObject({ code: 'functions/permission-denied' });
    await login('doctor'); await expect(call('getFeedbackModerationQueue')).rejects.toMatchObject({ code: 'functions/permission-denied' });
  }, 30_000);
  it('limits the receptionist role to operational coordination without clinical intake', async () => {
    await login('receptionist');
    expect((await call('getStaffSession')).role).toBe('receptionist');
    await call('getFeedbackModerationQueue');
    await expect(call('listStaffAppointments', { dateKey: '2026-11-03' })).resolves.toMatchObject({ appointments: [] });
    await expect(call('listConsultationRequests', {})).resolves.toMatchObject({ requests: [] });
    for (const [name, data] of [['getVideoConsultationQueue', {}], ['getSqlStaffDirectory', {}], ['registerPatient', {}], ['transitionAppointment', { appointmentId: 'missing', to: 'completed' }]]) {
      await expect(call(name, data)).rejects.toMatchObject({ code: 'functions/permission-denied' });
    }
    await expect(call('getMyPatientReviews')).rejects.toMatchObject({ code: 'functions/permission-denied' });
  }, 30_000);
  it('pages published reviews without duplicates and rejects mismatched filters and oversized pages', async () => {
    for (let i = 0; i < 3; i++) { const { id } = await submit({ rating: 2 }); await login('admin'); await call('moderatePatientFeedback', { feedbackId: id, action: 'publish', version: 1 }); }
    const a = await call('listPatientReviews', { rating: 2, limit: 2 }); const b = await call('listPatientReviews', { rating: 2, limit: 2, cursor: a.nextCursor });
    expect(a.reviews).toHaveLength(2); expect(b.reviews).toHaveLength(1); expect(new Set([...a.reviews, ...b.reviews].map(r => r.id)).size).toBe(3);
    await expect(call('listPatientReviews', { rating: 3, cursor: a.nextCursor })).rejects.toMatchObject({ code: 'functions/invalid-argument' });
    await expect(call('listPatientReviews', { limit: 200 })).rejects.toMatchObject({ code: 'functions/invalid-argument' });
  }, 30_000);
});
