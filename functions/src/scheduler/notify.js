// Notification outbox (spec A2-01/A2-03 fills this in).
//
// The booking callables already call this after their transaction commits, so the outbox
// stays a no-op until the provider adapter and templates land. It must never throw: a
// notification problem may not fail a booked appointment.
//
// PHI: nothing here may log or accept patient data — the appointment id is the only handle,
// and the outbox document reads the details it needs when it is processed.
const enqueueForAppointment = async (type, appointmentId) => {
  if (!type || !appointmentId) return { enqueued: false, type: type || null };
  return { enqueued: false, type };
};

module.exports = { enqueueForAppointment };
