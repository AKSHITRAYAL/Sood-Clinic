const { HttpsError } = require('firebase-functions/v2/https');
const { FieldValue, FieldPath } = require('firebase-admin/firestore');
const { requireLiveStaff } = require('./staffAuthorization');
const { istDateKey } = require('./ist');

// Developer-selected highlights: existing published, consented review IDs only.
const FEATURED_REVIEW_IDS = Object.freeze([]);
const idPattern = /^[A-Za-z0-9_-]{1,200}$/;
const fail = (code, message) => new HttpsError(code, message);
const instant = value => value?.toDate?.().toISOString() || null;
const versionOf = row => row.version || 1;
const input = (request, keys) => {
  const data = request.data ?? {};
  if (typeof data !== 'object' || Array.isArray(data) || Object.keys(data).some(key => !keys.includes(key))) throw fail('invalid-argument', 'Check the review details and try again.');
  return data;
};
const id = value => { if (typeof value !== 'string' || !idPattern.test(value)) throw fail('invalid-argument', 'Choose a valid review.'); return value; };
const text = (value, min, max) => {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw fail('invalid-argument', `Enter between ${min} and ${max} characters.`);
  return value.trim();
};
const tokens = value => [...new Set(value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]{2,40}/gu) || [])].slice(0, 350);
const publicRow = (doc) => {
  const row = doc.data();
  return { id: doc.id, rating: row.rating, comment: row.publicComment ?? row.comment,
    authorLabel: 'Verified patient', verifiedVisit: true, privacyEdited: row.publicComment != null,
    publishedAt: instant(row.publishedAt), updatedAt: instant(row.updatedAt), helpfulCount: row.helpfulCount || 0,
    reply: row.reply?.text ? { text: row.reply.text, at: instant(row.reply.at) } : null };
};
function createReviews({ db, auth }) {
  const reviews = db.collection('patientFeedback');
  const published = () => reviews.where('status', '==', 'published').where('publicConsent', '==', true);
  async function account(request, patientOnly = false) {
    if (!request.auth?.uid) throw fail('permission-denied', 'Sign in to continue.');
    let user;
    try { user = await auth.getUser(request.auth.uid); } catch { throw fail('permission-denied', 'Sign in again to continue.'); }
    const cutoff = Date.parse(user.tokensValidAfterTime || '1970-01-01') / 1000;
    if (user.disabled || !Number.isFinite(request.auth.token.auth_time) || !Number.isFinite(cutoff) || request.auth.token.auth_time < cutoff
      || (patientOnly && (request.auth.token.role || user.customClaims?.role))) throw fail('permission-denied', 'Current patient access is required.');
    return user.uid;
  }
  const moderator = request => requireLiveStaff(auth, request, { roles: ['admin', 'manager'] });
  const requireVersion = (value, row) => {
    if (!Number.isInteger(value) || value !== versionOf(row)) throw fail('aborted', 'This review changed. Refresh it before saving.');
  };
  async function quota(tx, uid, type, ceiling) {
    const ref = db.collection('reviewRateLimits').doc(`${uid}_${type}_${istDateKey()}`);
    const snap = await tx.get(ref); const count = snap.get('count') || 0;
    if (count >= ceiling) throw fail('resource-exhausted', 'Too many review changes today. Please try again tomorrow.');
    return () => tx.set(ref, { count: count + 1, updatedAt: FieldValue.serverTimestamp() });
  }
  function record(tx, ref, request, action, version, previous) {
    tx.set(ref.collection('history').doc(), { action, version, at: FieldValue.serverTimestamp(), actorUid: request.auth.uid,
      ...(previous ? { previous } : {}) });
    tx.set(db.collection('auditLogs').doc(), { action: `patient_feedback_${action}`, at: FieldValue.serverTimestamp(),
      actor: { uid: request.auth.uid, role: request.auth.token.role || 'patient' }, resource: { type: 'patient_feedback', id: ref.id }, meta: { version } });
  }
  async function submit(request) {
    const uid = await account(request, true);
    const data = input(request, ['appointmentId', 'rating', 'comment', 'publicConsent', 'version']);
    const appointmentId = id(data.appointmentId); const comment = text(data.comment, 10, 2000);
    if (!Number.isInteger(data.rating) || data.rating < 1 || data.rating > 5 || typeof data.publicConsent !== 'boolean') throw fail('invalid-argument', 'Choose 1–5 stars and your sharing preference.');
    const ref = reviews.doc(appointmentId);
    await db.runTransaction(async tx => {
      const [appointment, existing] = await Promise.all([tx.get(db.collection('appointments').doc(appointmentId)), tx.get(ref)]);
      if (!appointment.exists || appointment.get('patientId') !== uid || appointment.get('status') !== 'completed') throw fail('permission-denied', 'Reviews are available after your own completed visit.');
      const old = existing.data();
      if (old) { if (old.patientId !== uid) throw fail('permission-denied', 'You can only edit your own review.'); requireVersion(data.version, old); }
      else if (data.version !== undefined) throw fail('aborted', 'Refresh your visits before submitting.');
      const useQuota = await quota(tx, uid, 'author', 20);
      const version = old ? versionOf(old) + 1 : 1; const now = FieldValue.serverTimestamp();
      tx.set(ref, { appointmentId, patientId: uid, rating: data.rating, comment, publicConsent: data.publicConsent,
        consentAt: now, status: 'pending', version, updatedAt: now, publicComment: null, featuredRank: null,
        searchTokens: tokens(comment), ...(old ? {} : { createdAt: now, helpfulCount: 0, reportCount: 0 }) }, { merge: true });
      record(tx, ref, request, old ? 'edited' : 'submitted', version, old ? { comment: old.comment, rating: old.rating, publicConsent: old.publicConsent === true } : null);
      useQuota();
    });
    return { message: 'Thank you. Your feedback is awaiting moderation. All ratings are welcome.' };
  }
  async function own(request) {
    const uid = await account(request, true); const data = input(request, ['cursor']);
    let query = reviews.where('patientId', '==', uid).orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
    if (data.cursor) { const after = await reviews.doc(id(data.cursor)).get(); if (!after.exists || after.get('patientId') !== uid) throw fail('invalid-argument', 'Reload your reviews.'); query = query.startAfter(after); }
    const [rows, visits] = await Promise.all([query.limit(21).get(), db.collection('appointments').where('patientId', '==', uid).where('status', '==', 'completed').orderBy('startsAt', 'desc').limit(30).get()]);
    return { reviews: rows.docs.slice(0, 20).map(doc => ({ id: doc.id, rating: doc.get('rating'), comment: doc.get('comment'), publicConsent: doc.get('publicConsent') === true, status: doc.get('status'), version: versionOf(doc.data()), createdAt: instant(doc.get('createdAt')) })),
      nextCursor: rows.size > 20 ? rows.docs[19].id : null,
      visits: visits.docs.map(doc => ({ id: doc.id, at: instant(doc.get('startsAt')) })) };
  }
  async function withdraw(request) {
    const uid = await account(request, true); const data = input(request, ['feedbackId', 'version']); const ref = reviews.doc(id(data.feedbackId));
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref); const row = snap.data();
      if (!row || row.patientId !== uid) throw fail('permission-denied', 'You can only withdraw your own review.'); requireVersion(data.version, row);
      tx.update(ref, { status: 'withdrawn', featuredRank: null, publicConsent: false, version: versionOf(row) + 1, updatedAt: FieldValue.serverTimestamp() });
      record(tx, ref, request, 'withdrawn', versionOf(row) + 1);
    }); return { message: 'Your review has been removed from public view.' };
  }
  async function list(request) {
    const data = input(request, ['sort', 'rating', 'search', 'limit', 'cursor']);
    const sort = data.sort ?? 'newest'; const rating = data.rating ?? 0; const limit = data.limit ?? 10;
    const search = data.search ? text(data.search, 2, 40).normalize('NFKC').toLowerCase() : '';
    if (!['newest', 'highest', 'lowest', 'helpful'].includes(sort) || !Number.isInteger(rating) || rating < 0 || rating > 5
      || !Number.isInteger(limit) || limit < 1 || limit > 20 || (search && !/^[\p{L}\p{N}]{2,40}$/u.test(search))) throw fail('invalid-argument', 'Choose a valid filter or one search word.');
    const scope = JSON.stringify([sort, rating, search]);
    let query = published(); if (rating) query = query.where('rating', '==', rating); if (search) query = query.where('searchTokens', 'array-contains', search);
    if (!rating && ['highest', 'lowest'].includes(sort)) query = query.orderBy('rating', sort === 'highest' ? 'desc' : 'asc');
    if (sort === 'helpful') query = query.orderBy('helpfulCount', 'desc');
    query = query.orderBy('publishedAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
    if (data.cursor != null) {
      if (typeof data.cursor !== 'object' || data.cursor.scope !== scope) throw fail('invalid-argument', 'Reload reviews after changing filters.');
      const after = await reviews.doc(id(data.cursor.id)).get(); const row = after.data();
      if (!row || row.status !== 'published' || !row.publicConsent || (rating && row.rating !== rating) || (search && !row.searchTokens?.includes(search))) throw fail('failed-precondition', 'Reviews changed. Return to the first page.');
      query = query.startAfter(after);
    }
    const [page, counts, highlights, pinned] = await Promise.all([
      query.limit(limit + 1).get(), Promise.all([1, 2, 3, 4, 5].map(async star => (await published().where('rating', '==', star).count().get()).data().count)),
      published().where('featuredRank', '>=', 1).orderBy('featuredRank').limit(6).get(),
      FEATURED_REVIEW_IDS.length ? db.getAll(...FEATURED_REVIEW_IDS.slice(0, 6).map(key => reviews.doc(key))) : [],
    ]);
    const count = counts.reduce((a, b) => a + b, 0); const selected = [...pinned, ...highlights.docs].filter(doc => doc.exists && doc.get('status') === 'published' && doc.get('publicConsent') === true);
    const unique = [...new Map(selected.map(doc => [doc.id, doc])).values()].slice(0, 6);
    return { reviews: page.docs.slice(0, limit).map(publicRow), nextCursor: page.size > limit ? { id: page.docs[limit - 1].id, scope } : null,
      featured: unique.map(publicRow), summary: { count, average: count ? counts.reduce((sum, n, i) => sum + n * (i + 1), 0) / count : 0,
        distribution: Object.fromEntries(counts.map((n, i) => [i + 1, n])) } };
  }
  async function queue(request) {
    await moderator(request); const data = input(request, ['status', 'cursor']); const status = data.status || 'pending';
    if (!['pending', 'published', 'unpublished', 'rejected', 'withdrawn', 'reported', 'featured'].includes(status)) throw fail('invalid-argument', 'Choose a valid queue.');
    let query = reviews;
    if (status === 'reported') query = query.where('reportCount', '>', 0).orderBy('reportCount', 'desc');
    else if (status === 'featured') query = query.where('featuredRank', '>=', 1).orderBy('featuredRank');
    else query = query.where('status', '==', status);
    query = query.orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
    if (data.cursor != null) {
      if (data.cursor.status !== status) throw fail('invalid-argument', 'Reload the moderation queue.');
      const after = await reviews.doc(id(data.cursor.id)).get(); const row = after.data();
      if (!row || (status === 'reported' ? !row.reportCount : status === 'featured' ? !row.featuredRank : row.status !== status)) throw fail('failed-precondition', 'The queue changed. Return to its first page.');
      query = query.startAfter(after);
    }
    const page = await query.limit(21).get();
    return { feedback: page.docs.slice(0, 20).map(doc => { const r = doc.data(); return { ...publicRow(doc), comment: r.comment, publicComment: r.publicComment ?? null,
      status: r.status, publicConsent: r.publicConsent === true, version: versionOf(r), featuredRank: r.featuredRank || null,
      reportCount: r.reportCount || 0, moderationReason: r.moderationReason || '', createdAt: instant(r.createdAt) }; }),
      nextCursor: page.size > 20 ? { status, id: page.docs[19].id } : null };
  }
  async function detail(request) {
    await moderator(request); const data = input(request, ['feedbackId']); const ref = reviews.doc(id(data.feedbackId));
    if (!(await ref.get()).exists) throw fail('not-found', 'Review not found.');
    const [reports, history] = await Promise.all([ref.collection('reports').orderBy('at', 'desc').limit(20).get(), ref.collection('history').orderBy('at', 'desc').limit(20).get()]);
    return { reports: reports.docs.map(d => ({ category: d.get('category'), reason: d.get('reason'), at: instant(d.get('at')) })),
      history: history.docs.map(d => ({ action: d.get('action'), version: d.get('version'), at: instant(d.get('at')) })) };
  }
  async function moderate(request) {
    await moderator(request); const data = input(request, ['feedbackId', 'action', 'version', 'reason', 'comment', 'reply', 'rank']);
    const ref = reviews.doc(id(data.feedbackId)); const action = data.action;
    if (!['publish', 'reject', 'unpublish', 'feature', 'unfeature', 'reply', 'redact', 'restore', 'resolve_reports'].includes(action)) throw fail('invalid-argument', 'Choose a valid moderation action.');
    const reason = ['reject', 'unpublish', 'redact', 'restore', 'resolve_reports'].includes(action) ? text(data.reason, 5, 300) : null;
    const comment = action === 'redact' ? text(data.comment, 10, 2000) : null;
    const reply = action === 'reply' ? text(data.reply, 0, 1200) : null;
    if (action === 'feature' && (!Number.isInteger(data.rank) || data.rank < 1 || data.rank > 6)) throw fail('invalid-argument', 'Choose highlight position 1–6.');
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref); const row = snap.data(); if (!row) throw fail('not-found', 'Review not found.'); requireVersion(data.version, row);
      if (row.status === 'withdrawn') throw fail('failed-precondition', 'Only the patient can resubmit a withdrawn review.');
      if (action === 'publish' && row.publicConsent !== true) throw fail('failed-precondition', 'The patient has not agreed to public sharing.');
      if (action === 'feature' && row.status !== 'published') throw fail('failed-precondition', 'Publish a consented review before highlighting it.');
      const patch = { version: versionOf(row) + 1, reviewedAt: FieldValue.serverTimestamp(), reviewedBy: request.auth.uid };
      if (['publish', 'reject', 'unpublish'].includes(action)) {
        patch.status = { publish: 'published', reject: 'rejected', unpublish: 'unpublished' }[action];
        if (action === 'publish') { patch.publishedAt = row.publishedAt || FieldValue.serverTimestamp(); patch.helpfulCount = row.helpfulCount || 0; patch.searchTokens = tokens(row.publicComment ?? row.comment); }
        else patch.featuredRank = null;
      }
      if (reason) patch.moderationReason = reason;
      if (action === 'feature') patch.featuredRank = data.rank;
      if (action === 'unfeature') patch.featuredRank = null;
      if (action === 'reply') patch.reply = reply ? { text: reply, at: FieldValue.serverTimestamp() } : null;
      if (action === 'redact' || action === 'restore') { patch.publicComment = action === 'redact' ? comment : null; patch.searchTokens = tokens(comment ?? row.comment); }
      if (action === 'resolve_reports') patch.reportCount = 0;
      tx.update(ref, patch);
      record(tx, ref, request, action, patch.version, action === 'redact' || action === 'restore' ? { publicComment: row.publicComment ?? null } : action === 'reply' ? { reply: row.reply || null } : null);
    }); return { message: 'Review updated.' };
  }
  async function interact(request) {
    const uid = await account(request, true); const data = input(request, ['feedbackId', 'action', 'helpful', 'category', 'reason']); const ref = reviews.doc(id(data.feedbackId));
    if (!['helpful', 'report'].includes(data.action) || (data.action === 'helpful' && typeof data.helpful !== 'boolean')) throw fail('invalid-argument', 'Choose a valid review action.');
    if (data.action === 'report' && !['privacy', 'spam', 'offensive', 'other'].includes(data.category)) throw fail('invalid-argument', 'Choose a report category.');
    const reason = data.action === 'report' ? text(data.reason, 5, 500) : null;
    await db.runTransaction(async tx => {
      const child = ref.collection(data.action === 'helpful' ? 'votes' : 'reports').doc(uid);
      const [snap, existing] = await Promise.all([tx.get(ref), tx.get(child)]); const row = snap.data();
      if (!row || row.status !== 'published' || row.publicConsent !== true) throw fail('not-found', 'This review is no longer public.');
      if (data.action === 'helpful' && row.patientId === uid) throw fail('failed-precondition', 'You cannot mark your own review helpful.');
      const useQuota = await quota(tx, uid, 'interaction', 120);
      if (data.action === 'helpful') {
        const before = existing.get('helpful') === true ? 1 : 0; const after = data.helpful ? 1 : 0;
        tx.set(child, { helpful: data.helpful, at: FieldValue.serverTimestamp() });
        tx.update(ref, { helpfulCount: Math.max(0, (row.helpfulCount || 0) + after - before) });
      } else if (!existing.exists) {
        tx.set(child, { category: data.category, reason, at: FieldValue.serverTimestamp() });
        tx.update(ref, { reportCount: (row.reportCount || 0) + 1 });
      }
      useQuota();
    }); return { message: data.action === 'report' ? 'Your report has been sent to the moderation team.' : 'Helpful vote updated.' };
  }
  return { submit, own, withdraw, list, queue, detail, moderate, interact };
}
module.exports = { createReviews, FEATURED_REVIEW_IDS };
