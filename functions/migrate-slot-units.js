const admin = require('firebase-admin');
const { FieldValue, Timestamp } = require('firebase-admin/firestore');
const { istDateKey } = require('./lib/ist');
const { unitSlotsForRange } = require('./lib/engine/units');

admin.initializeApp();
const db = admin.firestore();

// Dry run by default: it only counts what it would do. Set CLINIC_APPLY_SLOT_MIGRATION=true
// to create the missing unit documents, drop the legacy single-slot documents and rewrite
// each appointment's slotIds to the full unit list. Run it after deploy, before any
// appointment made under the old single-slot model is touched by the unit engine.
const APPLY = process.env.CLINIC_APPLY_SLOT_MIGRATION === 'true';
const ACTIVE_STATUSES = new Set(['scheduled', 'confirmed', 'checked_in', 'in_consultation']);
const UNIT_ID = /_\d{12}$/;
const MINUTE_MS = 60 * 1000;
const BATCH_LIMIT = 400;

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const legacySlotIdsOf = (appointment) => {
  const slotIds = Array.isArray(appointment.slotIds) && appointment.slotIds.length
    ? appointment.slotIds
    : (appointment.slotId ? [appointment.slotId] : []);
  return slotIds.filter((slotId) => !UNIT_ID.test(String(slotId)));
};

/** Every unit the appointment occupies: core minutes first, then both buffers. */
const unitsFor = ({ doctorId, startsAt, endsAt, bufferBeforeMinutes, bufferAfterMinutes }) => {
  const units = new Map();
  unitSlotsForRange(doctorId, startsAt, endsAt).forEach((unit) => units.set(unit.id, { ...unit, kind: 'core' }));
  const buffered = [
    ...unitSlotsForRange(doctorId, new Date(startsAt.getTime() - bufferBeforeMinutes * MINUTE_MS), startsAt),
    ...unitSlotsForRange(doctorId, endsAt, new Date(endsAt.getTime() + bufferAfterMinutes * MINUTE_MS)),
  ];
  buffered.forEach((unit) => {
    if (!units.has(unit.id)) units.set(unit.id, { ...unit, kind: 'buffer' });
  });
  return [...units.values()];
};

const run = async () => {
  const configSnapshot = await db.collection('clinic').doc('publicConfig').get();
  const config = configSnapshot.data() || {};
  const legacyBuffers = {
    bufferBeforeMinutes: Number.isFinite(Number(config.bufferBeforeMinutes)) ? Number(config.bufferBeforeMinutes) : 0,
    bufferAfterMinutes: Number.isFinite(Number(config.bufferAfterMinutes)) ? Number(config.bufferAfterMinutes) : 0,
  };
  const visitTypeCache = new Map();
  const visitTypeBuffers = async (visitTypeId) => {
    if (!visitTypeId) return legacyBuffers;
    if (!visitTypeCache.has(visitTypeId)) {
      const snapshot = await db.collection('visitTypes').doc(visitTypeId).get();
      const data = snapshot.exists ? snapshot.data() : null;
      visitTypeCache.set(visitTypeId, {
        bufferBeforeMinutes: Number.isFinite(Number(data?.bufferBeforeMinutes)) ? Number(data.bufferBeforeMinutes) : legacyBuffers.bufferBeforeMinutes,
        bufferAfterMinutes: Number.isFinite(Number(data?.bufferAfterMinutes)) ? Number(data.bufferAfterMinutes) : legacyBuffers.bufferAfterMinutes,
      });
    }
    return visitTypeCache.get(visitTypeId);
  };

  const snapshot = await db.collection('appointments')
    .where('startsAt', '>', Timestamp.fromDate(new Date()))
    .get();

  const plan = [];
  for (const document of snapshot.docs) {
    const appointment = document.data();
    if (!ACTIVE_STATUSES.has(appointment.status)) continue;
    const legacySlotIds = legacySlotIdsOf(appointment);
    if (!legacySlotIds.length) continue;
    const startsAt = toDate(appointment.startsAt);
    const endsAt = toDate(appointment.endsAt);
    if (!startsAt || !endsAt || endsAt <= startsAt) continue;
    const buffers = await visitTypeBuffers(appointment.visitType);
    plan.push({
      ref: document.ref,
      appointment,
      legacySlotIds,
      units: unitsFor({ doctorId: appointment.doctorId, startsAt, endsAt, ...buffers }),
    });
  }

  console.log(JSON.stringify({
    apply: APPLY,
    appointments: plan.length,
    units: plan.reduce((total, item) => total + item.units.length, 0),
  }));
  if (!APPLY) return;

  const writes = [];
  for (const item of plan) {
    const unitRefs = item.units.map((unit) => db.collection('appointmentSlots').doc(unit.id));
    if (!unitRefs.length) continue;
    const existing = await db.getAll(...unitRefs);
    item.units.forEach((unit, index) => {
      if (existing[index].exists) return;
      writes.push({
        ref: unitRefs[index],
        data: {
          doctorId: item.appointment.doctorId,
          dateKey: item.appointment.dateKey || istDateKey(unit.startsAt),
          startsAt: Timestamp.fromDate(unit.startsAt),
          endsAt: Timestamp.fromDate(unit.endsAt),
          appointmentId: item.ref.id,
          blockId: null,
          kind: unit.kind,
          visitTypeId: item.appointment.visitType || null,
          holdId: null,
          expiresAt: null,
          createdAt: FieldValue.serverTimestamp(),
        },
      });
    });
    item.legacySlotIds.forEach((slotId) => writes.push({ ref: db.collection('appointmentSlots').doc(slotId), remove: true }));
    writes.push({
      ref: item.ref,
      update: { slotIds: item.units.map((unit) => unit.id), updatedAt: FieldValue.serverTimestamp() },
    });
  }

  for (let index = 0; index < writes.length; index += BATCH_LIMIT) {
    const batch = db.batch();
    writes.slice(index, index + BATCH_LIMIT).forEach((write) => {
      if (write.remove) batch.delete(write.ref);
      else if (write.update) batch.update(write.ref, write.update);
      else batch.set(write.ref, write.data);
    });
    await batch.commit();
  }
  console.log(JSON.stringify({ applied: writes.length }));
};

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
