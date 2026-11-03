const { HttpsError } = require('firebase-functions/v2/https');
const { requireLiveStaff } = require('./staffAuthorization');
const { istInstant, istDateKey } = require('./ist');
const idPattern = /^[A-Za-z0-9_-]{1,200}$/;
const statuses = new Set(['scheduled', 'confirmed', 'checked_in', 'in_consultation', 'completed', 'cancelled', 'no_show']);
const invalid = () => new HttpsError('invalid-argument', 'Choose a valid clinic date and appointment page.');
const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
const iso = value => value?.toDate ? value.toDate().toISOString() : null;

// This allow-list is the manager's data boundary; never spread an appointment or snapshot.
function operationalAppointment(row, dateKey) {
  if (!idPattern.test(row.id) || row.dateKey !== dateKey || !statuses.has(row.status)
    || !row.startsAt?.toDate || !row.endsAt?.toDate || istDateKey(row.startsAt.toDate()) !== dateKey) {
    throw new HttpsError('failed-precondition', 'An appointment needs clinic review before it can be displayed.');
  }
  return {
    id: row.id, reference: text(row.reference, 120), dateKey,
    doctorId: text(row.doctorId, 120), branchId: text(row.branchId, 120), departmentId: text(row.departmentId, 120),
    startsAt: iso(row.startsAt), endsAt: iso(row.endsAt), status: row.status,
    visitMode: row.visitMode === 'video' ? 'video' : 'in_person', visitType: text(row.visitType, 100),
    patientSnapshot: { name: text(row.patientSnapshot?.name, 160), phone: text(row.patientSnapshot?.phone, 32) },
  };
}
function createStaffAppointmentReader({ auth, store }) {
  return async request => {
    const actor = await requireLiveStaff(auth, request, { roles: ['admin', 'doctor', 'manager', 'receptionist'] });
    const input = request.data || {};
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['dateKey', 'limit', 'cursor'].includes(key))
      || typeof input.dateKey !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.dateKey)) throw invalid();
    try { istInstant(input.dateKey); } catch { throw invalid(); }
    const limit = input.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalid();
    const cursor = input.cursor ?? null;
    if (cursor !== null) {
      if (typeof cursor !== 'object' || Array.isArray(cursor) || Object.keys(cursor).sort().join(',') !== 'dateKey,id,nanoseconds,seconds'
        || cursor.dateKey !== input.dateKey || !idPattern.test(cursor.id) || !Number.isSafeInteger(cursor.seconds)
        || cursor.seconds < -62135596800 || cursor.seconds > 253402300799 || !Number.isInteger(cursor.nanoseconds)
        || cursor.nanoseconds < 0 || cursor.nanoseconds >= 1e9
        || istDateKey(new Date(cursor.seconds * 1000)) !== input.dateKey) throw invalid();
    }
    const doctorId = actor.customClaims.role === 'doctor' ? actor.customClaims.doctorId : null;
    let rows;
    try { rows = await store.list({ dateKey: input.dateKey, doctorId, cursor, limit: limit + 1 }); }
    catch { throw new HttpsError('unavailable', 'Appointments could not be loaded. Please retry.'); }
    if (!Array.isArray(rows) || rows.length > limit + 1 || rows.some(row => doctorId && row.doctorId !== doctorId)) {
      throw new HttpsError('failed-precondition', 'Appointment access could not be confirmed.');
    }
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return {
      appointments: page.map(row => operationalAppointment(row, input.dateKey)),
      nextCursor: rows.length > limit ? { dateKey: input.dateKey, id: last.id, seconds: last.startsAt.seconds, nanoseconds: last.startsAt.nanoseconds } : null,
    };
  };
}
function firestoreStaffAppointmentStore(db, { Timestamp, FieldPath }) {
  return {
    async list({ dateKey, doctorId, cursor, limit }) {
      let query = db.collection('appointments').where('dateKey', '==', dateKey);
      if (doctorId) query = query.where('doctorId', '==', doctorId);
      query = query.orderBy('startsAt', 'asc').orderBy(FieldPath.documentId(), 'asc');
      if (cursor) query = query.startAfter(new Timestamp(cursor.seconds, cursor.nanoseconds), cursor.id);
      const snapshot = await query.limit(limit).get();
      return snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    },
  };
}
module.exports = { createStaffAppointmentReader, firestoreStaffAppointmentStore, operationalAppointment };
