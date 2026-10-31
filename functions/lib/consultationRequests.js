// Consultation-request and appointment-proposal workflow.
//
// Live booking still writes Firestore, so this workflow does too: one doctor's
// capacity is represented by `appointmentSlots` documents on a shared 30-minute
// grid, which every location and the video mode already respect. A request never
// touches capacity; approval and proposal acceptance promote it to a confirmed
// `appointments` row plus the occupied units, event, audit and notification in a
// single transaction.
//
// The SQL request/proposal draft lives in `SQL/dataconnect/deferred/` and is not
// part of the reduced first release.
const { HttpsError, } = require('firebase-functions/v2/https');
const { addIstDays, istDateKey, istInstant, weekdayIst } = require('./ist');
const { toE164 } = require('./phone');
const {
  DEFAULT_PROPOSAL_LIFETIME_HOURS,
  SLOT_MINUTES,
  buildSlots,
  hashToken,
  locationFor,
  minutesFor,
  normalisePolicy,
  orderRequests,
  overlaps,
  proposalExpiry,
  selectionRefusal,
  serviceKind,
  timeFor,
  unitSlotIds,
  unitStarts,
} = require('./consultationPolicy');

const REQUESTS = 'consultationRequests';
const PROPOSALS = 'appointmentProposals';
const MAX_BULK = 20;
const MAX_OPEN_REQUESTS_PER_PHONE = 3;
const MAX_PROPOSALS_PER_REQUEST = 3;
const CLIENT_REQUEST_ID = /^[a-zA-Z0-9_-]{16,128}$/;
const DOC_ID = /^[A-Za-z0-9_-]{1,200}$/;
const REFERENCE = /^CR-[0-9A-F]{8}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
// No email provider is configured for this project, and introducing a paid one is
// out of scope. Confirmations therefore queue a portal notification only and record
// email as not delivered instead of claiming a send.
const EMAIL_DELIVERY_CONFIGURED = false;

const text = (value, max) => String(value ?? '').trim().slice(0, max);
const fail = (code, message) => new HttpsError(code, message);
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const isPhone = (value) => /^\+?[0-9][0-9\s-]{6,18}$/.test(value);
const reference = () => `CR-${require('node:crypto').randomBytes(4).toString('hex').toUpperCase()}`;
const accessToken = () => require('node:crypto').randomBytes(24).toString('base64url');
const millis = (value) => {
  if (value?.toDate) return value.toDate().getTime();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? NaN : date.getTime();
};
const iso = (value) => {
  const at = millis(value);
  return Number.isFinite(at) ? new Date(at).toISOString() : null;
};
const activeStatus = (status) => ['scheduled', 'confirmed'].includes(status);
const requestOpen = (status) => ['pending', 'proposal_pending'].includes(status);

const CONFLICT_TEXT = Object.freeze({
  CLINIC_CLOSED: 'The clinic is closed on that date.',
  OUTSIDE_BOOKING_WINDOW: 'That date is outside the online booking window.',
  OUTSIDE_LOCATION_HOURS: 'That time is outside the permitted consultation hours for this mode or location.',
  TOO_SOON: 'That time is too soon to approve online.',
  SLOT_TAKEN: 'That time is no longer free for the doctor.',
  CONTACT_LIMIT: 'This contact already has the maximum number of upcoming appointments.',
  SERVICE_UNAVAILABLE: 'The selected appointment format is no longer available.',
  LOCATION_NOT_ALLOWED: 'The selected service is not offered at this location.',
});

function createConsultationWorkflow({
  db,
  auth,
  FieldValue,
  Timestamp,
  requireLiveStaff,
  loadConfig,
  loadCatalogue,
  loadPolicy,
  enforceRateLimit = async () => {},
  externalBusy = async () => [],
  syncAppointment = async () => {},
  unsyncAppointment = async () => {},
  now = () => new Date(),
}) {
  const collection = (name) => db.collection(name);

  const policy = async () => normalisePolicy(await loadPolicy());
  const config = () => loadConfig();
  const catalogue = () => loadCatalogue();

  const doctorFor = async (doctorId) => {
    const row = (await catalogue()).doctors.find((doctor) => doctor.id === doctorId);
    if (!row) throw fail('not-found', 'This doctor is not currently available for online consultations.');
    return row;
  };

  const serviceFor = async (serviceId) => {
    const settings = await config();
    const row = settings.visitTypes.find((item) => item.id === (serviceId || 'consultation') && item.active);
    if (!row) throw fail('invalid-argument', 'The selected appointment format is unavailable.');
    return { settings, service: row };
  };

  const assertSelection = (policyValue, service, mode, locationId) => {
    const refusal = selectionRefusal({ policy: policyValue, service, mode, locationId });
    if (refusal) throw fail(refusal.startsWith('Procedures') ? 'failed-precondition' : 'invalid-argument', refusal);
  };

  // Busy capacity: booked/held units for the doctor's date. Expired holds are
  // ignored so availability is correct even before the sweep audits them.
  const busyRangesFor = (rows) => rows
    .filter((row) => {
      if (!['booked', 'held', 'blocked'].includes(row.status)) return false;
      if (row.status === 'held' && Number.isFinite(row.expiresAt) && row.expiresAt <= now().getTime()) return false;
      return Number.isFinite(row.startsAt) && Number.isFinite(row.endsAt);
    })
    .map((row) => ({ startsAt: row.startsAt, endsAt: row.endsAt, status: row.status, proposalId: row.proposalId || null, appointmentId: row.appointmentId || null }));

  const readSlotRows = async (query) => (await query.get()).docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      status: data.status,
      proposalId: data.proposalId || null,
      appointmentId: data.appointmentId || null,
      startsAt: millis(data.startsAt),
      endsAt: millis(data.endsAt),
      expiresAt: millis(data.expiresAt),
    };
  });

  const daySlotQuery = (doctorId, dateKey) => collection('appointmentSlots').where('doctorId', '==', doctorId).where('dateKey', '==', dateKey);

  const dayBusy = async (doctorId, dateKey) => {
    const [rows, exception, outside] = await Promise.all([
      readSlotRows(daySlotQuery(doctorId, dateKey)),
      collection('scheduleExceptions').doc(`${doctorId}_${dateKey}`).get(),
      externalBusy({ doctorId, dateKey }).catch(() => []),
    ]);
    return {
      closed: exception.exists && exception.get('type') === 'closed',
      ranges: [...busyRangesFor(rows), ...(Array.isArray(outside) ? outside : [])],
      slots: rows,
    };
  };

  const daySlotsFor = async ({ doctorId, dateKey, mode, locationId, service }) => {
    const policyValue = await policy();
    const { settings } = await serviceFor(service.id);
    const busy = await dayBusy(doctorId, dateKey);
    if (busy.closed) return [];
    return buildSlots({
      doctorId, dateKey, mode, locationId,
      durationMinutes: service.minutes,
      policy: policyValue,
      leadMinutes: settings.leadMinutes,
      bookingWindowDays: settings.bookingWindowDays,
      bufferBeforeMinutes: settings.bufferBeforeMinutes,
      bufferAfterMinutes: settings.bufferAfterMinutes,
      busyRanges: busy.ranges,
      now: now(),
    });
  };

  const countsAsAppointment = (appointment) => activeStatus(appointment.status) && millis(appointment.startsAt) > now().getTime();

  // --- Public options and availability ------------------------------------
  async function getOptions() {
    const [policyValue, settings, catalog] = await Promise.all([policy(), config(), catalogue()]);
    return {
      timezone: 'Asia/Kolkata',
      slotMinutes: SLOT_MINUTES,
      bookingWindowDays: settings.bookingWindowDays,
      locations: policyValue.locations.map(({ id, name, address, landmark, phones, windows, procedureAllowed }) => ({ id, name, address, landmark, phones, windows, procedureAllowed })),
      videoWindows: policyValue.videoWindows,
      closedWeekdays: policyValue.closedWeekdays,
      doctor: catalog.doctors[0] ? { id: catalog.doctors[0].id, name: catalog.doctors[0].name, qualification: catalog.doctors[0].qualification } : null,
      services: settings.visitTypes.filter((row) => row.active).map(({ id, label, minutes, mode }) => ({ id, label, minutes, mode, kind: serviceKind(policyValue, id) })),
      // Email delivery has no configured provider; the confirmation UI must not
      // promise an email that will not be sent.
      notifications: { portal: true, email: EMAIL_DELIVERY_CONFIGURED },
    };
  }

  async function getAvailability(request) {
    const input = request.data || {};
    const doctorId = text(input.doctorId, 120);
    const dateKey = text(input.dateKey, 10);
    const serviceId = text(input.serviceId, 80);
    if (!doctorId || !DATE_KEY.test(dateKey)) throw fail('invalid-argument', 'Choose a valid doctor and consultation date.');
    const { service } = await serviceFor(serviceId);
    const mode = service.mode;
    if (mode === 'video' && input.locationId) throw fail('invalid-argument', 'Online consultations do not have a clinic location.');
    const locationId = mode === 'video' ? null : text(input.locationId, 40);
    const policyValue = await policy();
    assertSelection(policyValue, service, mode, locationId);
    await doctorFor(doctorId);
    const slots = await daySlotsFor({ doctorId, dateKey, mode, locationId, service });
    return {
      timezone: 'Asia/Kolkata',
      mode,
      locationId,
      durationMinutes: service.minutes,
      slots: slots.map((slot) => ({ slotId: slot.slotId, startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString(), time: slot.time })),
    };
  }

  // --- Public request submission ------------------------------------------
  async function submitRequest(request) {
    const input = request.data || {};
    const clientRequestId = text(input.clientRequestId, 128);
    if (!CLIENT_REQUEST_ID.test(clientRequestId)) throw fail('invalid-argument', 'Please refresh and try submitting again.');
    const accountUid = request.auth?.uid || null;
    if (request.auth && ['admin', 'doctor', 'manager'].includes(request.auth.token?.role)) throw fail('permission-denied', 'Use the staff booking workflow instead of the public request form.');
    const patient = input.patient || {};
    const name = text(patient.name, 120);
    const phone = text(patient.phone, 30);
    const email = text(patient.email, 160).toLowerCase();
    if (!name) throw fail('invalid-argument', 'Enter your full name.');
    if (phone && !isPhone(phone)) throw fail('invalid-argument', 'Enter a valid phone number.');
    if (email && !isEmail(email)) throw fail('invalid-argument', 'Enter a valid email address.');
    if (!phone && !email) throw fail('invalid-argument', 'Enter a phone number or email address so the clinic can confirm your request.');
    if (patient.consentToTreatment !== true) throw fail('invalid-argument', 'Please provide consent before sending your request.');
    const phoneKey = phone ? toE164(phone) : null;
    if (phone && !phoneKey) throw fail('invalid-argument', 'Enter a valid Indian phone number.');

    const { settings, service } = await serviceFor(input.serviceId);
    const mode = service.mode;
    if (!['in_person', 'video'].includes(mode)) throw fail('failed-precondition', 'This appointment format is not available for requests.');
    const doctorId = text(input.doctorId, 120) || (await catalogue()).doctors[0]?.id;
    const doctor = await doctorFor(doctorId);
    if (mode === 'video' && input.locationId) throw fail('invalid-argument', 'Online consultations do not have a clinic location.');
    const locationId = mode === 'video' ? null : text(input.locationId, 40);
    const policyValue = await policy();
    assertSelection(policyValue, service, mode, locationId);
    if (serviceKind(policyValue, service.id) === 'procedure' && mode !== 'in_person') throw fail('failed-precondition', 'Procedures require an in-person consultation.');

    let requested = null;
    if (mode === 'in_person') {
      const dateKey = text(input.dateKey, 10);
      const time = text(input.time, 5);
      if (!DATE_KEY.test(dateKey) || !TIME.test(time)) throw fail('invalid-argument', 'Choose a valid appointment date and time.');
      // The request does not reserve capacity, but a time that is not currently
      // offered must be refused rather than stored for later approval.
      const slots = await daySlotsFor({ doctorId, dateKey, mode, locationId, service });
      if (!slots.some((slot) => slot.time === time)) throw fail('failed-precondition', 'That time is not currently available. Please choose another time.');
      requested = { dateKey, time };
    }

    const hash = require('node:crypto').createHash('sha256').update(JSON.stringify([accountUid, mode, locationId, service.id, doctorId, name, phone, email, requested, text(input.reason, 500), text(input.consentVersion, 40)])).digest('hex');
    const requestRef = collection(REQUESTS).doc(clientRequestId);
    const token = accessToken();
    const existing = await requestRef.get();
    if (existing.exists) {
      if (existing.get('submissionHash') !== hash) throw fail('already-exists', 'That request id was used for different details. Please refresh and try again.');
      return {
        requestId: existing.id,
        reference: existing.get('reference'),
        status: existing.get('status'),
        mode: existing.get('mode'),
        approvalPending: existing.get('status') === 'pending' || existing.get('status') === 'proposal_pending',
        idempotent: true,
      };
    }
    await enforceRateLimit(request);
    if (phoneKey) await assertPhoneCapacity(phoneKey, { allowRequest: true });

    const referenceValue = reference();
    const createdAt = FieldValue.serverTimestamp();
    const consentVersion = text(input.consentVersion, 40) || 'consultation-request-v1';
    const guest = !accountUid;
    await db.runTransaction(async (transaction) => {
      const current = await transaction.get(requestRef);
      if (current.exists) {
        if (current.get('submissionHash') !== hash) throw fail('already-exists', 'That request id was used for different details. Please refresh and try again.');
        return;
      }
      // Re-check the one shared capacity source at write time: a request stores no
      // hold, but its time must still be free so staff are not asked to approve an
      // already-taken time.
      if (requested) {
        const busies = await transaction.get(daySlotQuery(doctorId, requested.dateKey));
        const rows = busies.docs.map((doc) => {
          const data = doc.data();
          return { status: data.status, startsAt: millis(data.startsAt), endsAt: millis(data.endsAt), expiry: millis(data.expiresAt) };
        }).filter((row) => ['booked', 'held', 'blocked'].includes(row.status) && !(row.status === 'held' && Number.isFinite(row.expiry) && row.expiry <= now().getTime()));
        const startsAt = istInstant(requested.dateKey, requested.time).getTime();
        const endsAt = startsAt + service.minutes * 60 * 1000;
        if (rows.some((row) => overlaps(startsAt, endsAt, row.startsAt, row.endsAt))) throw fail('failed-precondition', 'That time was just taken. Please choose another time.');
      }
      transaction.set(requestRef, {
        reference: referenceValue,
        clientRequestId,
        mode,
        locationId,
        serviceId: service.id,
        serviceLabel: service.label,
        durationMinutes: service.minutes,
        doctorId,
        requested,
        patient: { name, phone: phone || null, email: email || null },
        phoneKey,
        reason: text(input.reason, 500) || null,
        accountUid,
        guest,
        status: 'pending',
        appointmentId: null,
        acceptedProposalId: null,
        declineCode: null,
        declineReason: null,
        consent: { version: consentVersion, actor: guest ? 'guest' : 'authenticated_patient', acceptedAt: createdAt },
        accessTokenHash: hashToken(token),
        submissionHash: hash,
        version: 1,
        createdBy: accountUid ? { uid: accountUid, role: 'patient' } : { uid: null, role: 'public' },
        createdAt,
        updatedAt: createdAt,
      });
      transaction.set(requestRef.collection('events').doc(), {
        action: 'consultation_request_submitted', from: null, to: 'pending',
        byUid: accountUid, byRole: guest ? 'public' : 'patient', at: createdAt,
      });
      transaction.set(collection('auditLogs').doc(), {
        at: createdAt,
        actor: { uid: accountUid, role: guest ? 'public' : 'patient' },
        action: 'consultation_request_submitted',
        resource: { type: 'consultation_request', id: clientRequestId },
        meta: { mode, serviceId: service.id, doctorId, guest, hasRequestedTime: Boolean(requested) },
      });
      transaction.set(collection('notifications').doc(), {
        channel: accountUid ? 'portal' : 'clinic_console',
        template: 'consultation_request_received',
        recipient: accountUid,
        reference: referenceValue,
        status: 'queued',
        attempts: 0,
        sendAfter: createdAt,
        email: { configured: EMAIL_DELIVERY_CONFIGURED, to: email || null },
        createdAt,
      });
    });
    return {
      requestId: clientRequestId,
      reference: referenceValue,
      status: 'pending',
      mode,
      approvalPending: true,
      accessToken: token,
      idempotent: false,
    };
  }

  // Shared active-appointment cap. A submission additionally bounds the number of
  // open requests so one contact cannot flood the approval queue.
  async function openRequestCount(phone) {
    const snapshot = await collection(REQUESTS)
      .where('phoneKey', '==', phone)
      .where('status', 'in', ['pending', 'proposal_pending'])
      .get();
    return snapshot.size;
  }

  async function assertPhoneCapacity(phone, { allowRequest = false } = {}) {
    const existing = await collection('appointments')
      .where('phoneKey', '==', phone)
      .where('status', 'in', ['scheduled', 'confirmed'])
      .where('startsAt', '>', Timestamp.fromDate(now()))
      .limit(2)
      .get();
    if (existing.size >= 2) throw fail('resource-exhausted', 'You already have two upcoming appointments. Please contact the clinic to make another booking.');
    if (allowRequest && (await openRequestCount(phone)) >= MAX_OPEN_REQUESTS_PER_PHONE) {
      throw fail('resource-exhausted', 'You already have several requests awaiting clinic review. Please contact the clinic for more.');
    }
  }

  // --- Staff queue --------------------------------------------------------
  async function staffActor(request, roles = ['admin', 'doctor', 'manager']) {
    const user = await requireLiveStaff(auth, request, { roles });
    return { uid: request.auth.uid, role: user.customClaims.role, doctorId: user.customClaims.doctorId || null };
  }

  function staffRequestView(request, actor) {
    const videoIntakeRestricted = request.mode === 'video' && actor.role === 'manager';
    return {
      requestId: request.id,
      reference: request.reference,
      mode: request.mode,
      locationId: request.locationId || null,
      serviceId: request.serviceId,
      serviceLabel: request.serviceLabel,
      durationMinutes: request.durationMinutes,
      doctorId: request.doctorId,
      requested: request.requested || null,
      status: request.status,
      patient: { name: request.patient?.name || '', phone: request.patient?.phone || '', email: request.patient?.email || '' },
      // Video clinical intake is restricted to the treating doctor and admins until
      // a reviewed policy grants managers access.
      intake: videoIntakeRestricted ? { restricted: true } : { restricted: false, reason: request.reason || null },
      declineReason: request.declineReason || null,
      appointmentId: request.appointmentId || null,
      createdAt: iso(request.createdAt),
      version: request.version || 1,
    };
  }

  async function listRequests(request) {
    const actor = await staffActor(request);
    const status = text(request.data?.status, 40) || 'pending';
    if (!['pending', 'proposal_pending', 'confirmed', 'declined', 'cancelled', 'all'].includes(status)) throw fail('invalid-argument', 'Choose a valid request status.');
    let query = collection(REQUESTS);
    if (status !== 'all') query = query.where('status', '==', status);
    if (actor.role === 'doctor') query = query.where('doctorId', '==', actor.doctorId);
    const snapshot = await query.orderBy('createdAt', 'asc').limit(100).get();
    const rows = orderRequests(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    return { requests: rows.map((row) => staffRequestView(row, actor)), status };
  }

  async function listProposals(request) {
    const actor = await staffActor(request);
    const requestId = text(request.data?.requestId, 128);
    if (!DOC_ID.test(requestId)) throw fail('invalid-argument', 'Choose a valid consultation request.');
    const snapshot = await collection(PROPOSALS).where('requestId', '==', requestId).orderBy('createdAt', 'asc').limit(MAX_PROPOSALS_PER_REQUEST * 2).get();
    const rows = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((row) => actor.role !== 'doctor' || row.doctorId === actor.doctorId);
    return {
      proposals: rows.map((row) => ({
        proposalId: row.id, requestId: row.requestId, status: row.status,
        dateKey: row.dateKey, time: row.time, expiresAt: iso(row.expiresAt),
      })),
    };
  }

  // --- Capacity planning --------------------------------------------------
  // Pure decision for one request/proposal. `busy` rows come from the shared slot
  // collection; `claimed` carries ranges already taken by earlier rows of the same
  // batch. Buffers participate in both overlap checks.
  function planPromotion({ policyValue, settings, service, mode, locationId, doctorId, dateKey, time, busy, claimed = [], allowProposalId = null, phoneBlocked = false }) {
    const conflict = (code) => ({ ok: false, code, reason: CONFLICT_TEXT[code] });
    if (!service) return conflict('SERVICE_UNAVAILABLE');
    if (selectionRefusal({ policy: policyValue, service, mode, locationId })) return conflict('LOCATION_NOT_ALLOWED');
    const today = istDateKey(now());
    if (dateKey < today || dateKey > addIstDays(today, settings.bookingWindowDays)) return conflict('OUTSIDE_BOOKING_WINDOW');
    const weekday = weekdayIst(dateKey);
    if (policyValue.closedWeekdays.includes(weekday)) return conflict('CLINIC_CLOSED');
    const windows = mode === 'video' ? policyValue.videoWindows : (locationFor(policyValue, locationId)?.windows || []);
    const startMinutes = minutesFor(time);
    const fits = windows.some((window) => startMinutes >= minutesFor(window.start) && startMinutes + service.minutes <= minutesFor(window.end));
    if (!fits) return conflict('OUTSIDE_LOCATION_HOURS');
    const startsAt = istInstant(dateKey, time).getTime();
    const endsAt = startsAt + service.minutes * 60 * 1000;
    if (startsAt < now().getTime() + settings.leadMinutes * 60 * 1000) return conflict('TOO_SOON');
    if (phoneBlocked) return conflict('CONTACT_LIMIT');
    const buffered = {
      start: startsAt - settings.bufferBeforeMinutes * 60 * 1000,
      end: endsAt + settings.bufferAfterMinutes * 60 * 1000,
    };
    const blocked = busy.some((row) => {
      if (row.proposalId && allowProposalId && row.proposalId === allowProposalId) return false;
      return overlaps(buffered.start, buffered.end, row.startsAt, row.endsAt);
    }) || claimed.some((range) => overlaps(buffered.start, buffered.end, range.start, range.end));
    if (blocked) return conflict('SLOT_TAKEN');
    return { ok: true, startsAt: new Date(startsAt), endsAt: new Date(endsAt), unitIds: unitSlotIds({ doctorId, dateKey, startsAt, endsAt }), time, dateKey };
  }

  // Capacity/hold writes for a confirmed appointment. The slot grid is the one
  // authority shared by every mode and location.
  function writeOccupancy(transaction, { appointmentId, doctorId, dateKey, startsAt, endsAt, unitIds }) {
    const units = unitStarts({ startsAt, endsAt });
    unitIds.forEach((slotId, index) => {
      transaction.set(collection('appointmentSlots').doc(slotId), {
        doctorId,
        dateKey,
        startsAt: Timestamp.fromDate(units[index]),
        endsAt: Timestamp.fromDate(new Date(units[index].getTime() + SLOT_MINUTES * 60 * 1000)),
        appointmentId,
        status: 'booked',
        proposalId: null,
        expiresAt: null,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  }

  function writeNotification(transaction, { channel, template, recipient, reference: ref, email, at }) {
    transaction.set(collection('notifications').doc(), {
      channel, template, recipient, reference: ref, status: 'queued', attempts: 0,
      sendAfter: at,
      email: { configured: EMAIL_DELIVERY_CONFIGURED, to: email || null },
      createdAt: at,
    });
  }

  function releaseProposalHolds(transaction, proposal) {
    (proposal.unitIds || []).forEach((slotId) => transaction.delete(collection('appointmentSlots').doc(slotId)));
  }

  // One confirmed appointment from a request/proposal decision. Called only after
  // every read in the surrounding transaction.
  function promote(transaction, {
    requestDoc, actor, appointmentRef, service, mode, locationId, doctor,
    dateKey, time, startsAt, endsAt, unitIds, consent, acceptedProposal, supersededProposals, requestStatus = 'confirmed',
  }) {
    const appointmentId = appointmentRef.id;
    const referenceValue = `SC-${require('node:crypto').randomBytes(4).toString('hex').toUpperCase()}`;
    const at = FieldValue.serverTimestamp();
    const createdBy = { uid: actor.uid, role: actor.role };
    transaction.set(appointmentRef, {
      reference: referenceValue,
      branchId: doctor.branchId || null,
      departmentId: doctor.departmentIds?.[0] || null,
      doctorId: doctor.id,
      visitType: service.id,
      visitMode: mode,
      locationId,
      dateKey,
      startsAt: Timestamp.fromDate(startsAt),
      endsAt: Timestamp.fromDate(endsAt),
      status: 'confirmed',
      source: requestDoc.accountUid ? 'patient_portal' : 'web',
      patientId: requestDoc.accountUid || null,
      patientSnapshot: { name: requestDoc.patient?.name || '', phone: requestDoc.patient?.phone || null, email: requestDoc.patient?.email || null },
      phoneKey: requestDoc.phoneKey || null,
      reason: requestDoc.reason || null,
      consultationRequestId: requestDoc.id,
      acceptedProposalId: acceptedProposal?.id || null,
      slotIds: unitIds,
      consent: consent || requestDoc.consent || { version: 'consultation-request-v1', acceptedAt: at },
      createdBy,
      externalCalendar: { provider: 'google', syncStatus: 'not_connected' },
      videoConsultation: mode === 'video' ? { status: 'awaiting_link' } : null,
      createdAt: at,
      updatedAt: at,
    });
    writeOccupancy(transaction, { appointmentId, doctorId: doctor.id, dateKey, startsAt, endsAt, unitIds });
    transaction.set(appointmentRef.collection('events').doc(), {
      from: null, to: 'confirmed', byUid: actor.uid, byRole: actor.role, at,
      meta: { source: 'consultation_request', requestReference: requestDoc.reference },
    });
    transaction.update(requestDoc.ref, {
      status: 'confirmed',
      appointmentId,
      acceptedProposalId: acceptedProposal?.id || null,
      decidedBy: actor.uid,
      decidedByRole: actor.role,
      confirmedAt: at,
      updatedAt: at,
      version: FieldValue.increment(1),
    });
    transaction.set(requestDoc.ref.collection('events').doc(), {
      action: 'consultation_request_confirmed', from: requestDoc.status, to: 'confirmed',
      byUid: actor.uid, byRole: actor.role, at, meta: { appointmentId, proposalId: acceptedProposal?.id || null },
    });
    transaction.set(collection('auditLogs').doc(), {
      at, actor: { uid: actor.uid, role: actor.role },
      action: 'consultation_request_confirmed',
      resource: { type: 'consultation_request', id: requestDoc.id },
      meta: { appointmentId, mode, locationId: locationId || null, dateKey, time, requestReference: requestDoc.reference, proposalId: acceptedProposal?.id || null },
    });
    writeNotification(transaction, {
      channel: requestDoc.accountUid ? 'portal' : 'clinic_console',
      template: 'consultation_confirmed', recipient: requestDoc.accountUid || null,
      reference: requestDoc.reference, email: requestDoc.patient?.email || null, at,
    });
    if (acceptedProposal) {
      transaction.update(acceptedProposal.ref, { status: 'accepted', acceptedAt: at, appointmentId, updatedAt: at, version: FieldValue.increment(1) });
      transaction.set(acceptedProposal.ref.collection('events').doc(), { action: 'proposal_accepted', from: 'pending', to: 'accepted', byRole: 'patient', at, meta: { appointmentId } });
      transaction.set(collection('auditLogs').doc(), {
        at, actor: { uid: null, role: 'patient' }, action: 'consultation_proposal_accepted',
        resource: { type: 'consultation_request', id: requestDoc.id }, meta: { proposalId: acceptedProposal.id, appointmentId },
      });
    }
    (supersededProposals || []).forEach((proposal) => {
      releaseProposalHolds(transaction, proposal);
      transaction.update(proposal.ref, { status: 'superseded', supersededAt: at, updatedAt: at, version: FieldValue.increment(1) });
      transaction.set(proposal.ref.collection('events').doc(), { action: 'proposal_superseded', from: 'pending', to: 'superseded', byRole: 'system', at, meta: { acceptedProposalId: acceptedProposal?.id || null } });
      transaction.set(collection('auditLogs').doc(), {
        at, actor: { uid: actor.uid, role: actor.role }, action: 'consultation_proposal_superseded',
        resource: { type: 'consultation_request', id: requestDoc.id }, meta: { proposalId: proposal.id, acceptedProposalId: acceptedProposal?.id || null },
      });
    });
    return { appointmentId, reference: referenceValue };
  }

  async function approveRequest(request) {
    const actor = await staffActor(request);
    const requestId = text(request.data?.requestId, 128);
    if (!DOC_ID.test(requestId)) throw fail('invalid-argument', 'Choose a valid consultation request.');
    const [policyValue, settings, catalog] = await Promise.all([policy(), config(), catalogue()]);
    const requestRef = collection(REQUESTS).doc(requestId);
    let result;
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(requestRef);
      if (!snapshot.exists) throw fail('not-found', 'Consultation request not found.');
      const row = { id: snapshot.id, ref: snapshot.ref, ...snapshot.data() };
      if (actor.role === 'doctor' && row.doctorId !== actor.doctorId) throw fail('permission-denied', 'You can only approve your own consultation requests.');
      if (row.status === 'confirmed') {
        result = { requestId, status: 'confirmed', appointmentId: row.appointmentId, idempotent: true, mode: row.mode };
        return;
      }
      if (row.status !== 'pending') throw fail('failed-precondition', 'This request is no longer awaiting approval.');
      const service = settings.visitTypes.find((item) => item.id === row.serviceId && item.active);
      if (!service) throw fail('failed-precondition', 'The requested appointment format is no longer available.');
      // Video requests carry no time: staff assign one when approving. In-person
      // approval uses the time the patient asked for.
      const dateKey = text(request.data?.dateKey, 10) || row.requested?.dateKey;
      const time = text(request.data?.time, 5) || row.requested?.time;
      if (!DATE_KEY.test(dateKey || '') || !TIME.test(time || '')) throw fail('invalid-argument', row.mode === 'video' ? 'Choose a permitted date and time for this online request.' : 'This request has no valid requested time.');
      const doctor = catalog.doctors.find((item) => item.id === row.doctorId);
      if (!doctor) throw fail('failed-precondition', 'The selected doctor is no longer available.');
      const [busies, patients] = await Promise.all([
        transaction.get(daySlotQuery(row.doctorId, dateKey)),
        row.phoneKey
          ? transaction.get(collection('appointments').where('phoneKey', '==', row.phoneKey).where('status', 'in', ['scheduled', 'confirmed']).limit(3))
          : Promise.resolve(null),
      ]);
      const busy = busies.docs.map((doc) => {
        const data = doc.data();
        return { status: data.status, proposalId: data.proposalId || null, startsAt: millis(data.startsAt), endsAt: millis(data.endsAt), expiry: millis(data.expiresAt) };
      }).filter((item) => ['booked', 'held', 'blocked'].includes(item.status) && !(item.status === 'held' && Number.isFinite(item.expiry) && item.expiry <= now().getTime()));
      const phoneBlocked = Boolean(patients && patients.docs.filter((doc) => countsAsAppointment(doc.data())).length >= 2);
      const plan = planPromotion({
        policyValue, settings, service, mode: row.mode, locationId: row.locationId || null,
        doctorId: row.doctorId, dateKey, time, busy, phoneBlocked,
      });
      if (!plan.ok) throw fail('failed-precondition', plan.reason);
      const appointmentRef = collection('appointments').doc();
      const promoted = promote(transaction, {
        requestDoc: row, actor, appointmentRef, service, mode: row.mode, locationId: row.locationId || null,
        doctor, dateKey, time, startsAt: plan.startsAt, endsAt: plan.endsAt, unitIds: plan.unitIds,
        consent: row.consent, acceptedProposal: null, supersededProposals: [],
      });
      result = { requestId, status: 'confirmed', idempotent: false, mode: row.mode, ...promoted };
    });
    if (!result.idempotent) await syncAppointment(result.appointmentId);
    return result;
  }

  async function declineRequest(request) {
    const actor = await staffActor(request);
    const requestId = text(request.data?.requestId, 128);
    const reason = text(request.data?.reason, 300);
    if (!DOC_ID.test(requestId)) throw fail('invalid-argument', 'Choose a valid consultation request.');
    if (!reason) throw fail('invalid-argument', 'A decline reason is required.');
    const requestRef = collection(REQUESTS).doc(requestId);
    let result;
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(requestRef);
      if (!snapshot.exists) throw fail('not-found', 'Consultation request not found.');
      const row = { id: snapshot.id, ref: snapshot.ref, ...snapshot.data() };
      if (actor.role === 'doctor' && row.doctorId !== actor.doctorId) throw fail('permission-denied', 'You can only decline your own consultation requests.');
      if (row.status === 'declined') {
        result = { requestId, status: 'declined', idempotent: true };
        return;
      }
      if (!requestOpen(row.status)) throw fail('failed-precondition', 'This request can no longer be declined.');
      const at = FieldValue.serverTimestamp();
      transaction.update(requestRef, {
        status: 'declined', declineCode: 'STAFF_DECLINED', declineReason: reason,
        decidedBy: actor.uid, decidedByRole: actor.role, declinedAt: at, updatedAt: at,
        version: FieldValue.increment(1),
      });
      transaction.set(requestRef.collection('events').doc(), {
        action: 'consultation_request_declined', from: row.status, to: 'declined',
        byUid: actor.uid, byRole: actor.role, at, reason,
      });
      transaction.set(collection('auditLogs').doc(), {
        at, actor: { uid: actor.uid, role: actor.role }, action: 'consultation_request_declined',
        resource: { type: 'consultation_request', id: requestId }, meta: { reason, requestReference: row.reference },
      });
      writeNotification(transaction, {
        channel: row.accountUid ? 'portal' : 'clinic_console', template: 'consultation_declined',
        recipient: row.accountUid || null, reference: row.reference, email: row.patient?.email || null, at,
      });
      result = { requestId, status: 'declined', idempotent: false };
    });
    return result;
  }

  // Bounded server-side batch. Everything is read first, then every confirmed or
  // declined row is written in the SAME transaction: a known scheduling conflict is
  // recorded and the rest proceed, while an unexpected failure rolls back the batch.
  async function bulkApprove(request) {
    const actor = await staffActor(request);
    const limitInput = Number(request.data?.limit);
    const limit = Number.isInteger(limitInput) ? Math.min(Math.max(limitInput, 1), MAX_BULK) : MAX_BULK;
    const ids = Array.isArray(request.data?.requestIds) ? request.data.requestIds.map((value) => text(value, 128)) : null;
    if (ids && (ids.length < 1 || ids.length > MAX_BULK || ids.some((id) => !DOC_ID.test(id)))) throw fail('invalid-argument', 'Select between one and twenty valid consultation requests.');
    const [policyValue, settings, catalog] = await Promise.all([policy(), config(), catalogue()]);

    let source;
    if (ids) {
      const snapshots = await Promise.all(ids.map((id) => collection(REQUESTS).doc(id).get()));
      source = snapshots.map((snapshot) => ({ id: snapshot.id, ref: snapshot.ref, ...snapshot.data() }));
      if (source.some((row) => !row.reference)) throw fail('not-found', 'One of the selected requests no longer exists.');
    } else {
      let query = collection(REQUESTS).where('status', '==', 'pending');
      if (actor.role === 'doctor') query = query.where('doctorId', '==', actor.doctorId);
      const snapshot = await query.orderBy('createdAt', 'asc').limit(limit * 3).get();
      source = snapshot.docs.map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }));
    }
    // Selected ids are returned with their own outcome (so a retry is idempotent);
    // an automatic batch only ever contains pending requests.
    const candidates = orderRequests(source.filter((row) => actor.role !== 'doctor' || row.doctorId === actor.doctorId)).slice(0, limit);
    if (!candidates.length) return { outcomes: [], confirmed: 0, declined: 0 };

    const assignments = request.data?.assignments || {};
    const dateKeys = [...new Set(candidates.map((row) => text(assignments[row.id]?.dateKey, 10) || row.requested?.dateKey).filter((dateKey) => DATE_KEY.test(dateKey || '')))];
    const doctorIds = [...new Set(candidates.map((row) => row.doctorId))];

    const outcomes = [];
    const confirmations = [];
    await db.runTransaction(async (transaction) => {
      // Every read (requests, shared capacity, contact caps) happens before the
      // first write, so the whole batch rechecks live state and rolls back as one
      // unit instead of committing partial decisions.
      const current = await Promise.all(candidates.map((row) => transaction.get(collection(REQUESTS).doc(row.id))));
      const busyByDay = new Map();
      for (const doctorId of doctorIds) {
        for (const dateKey of dateKeys) {
          const snapshot = await transaction.get(daySlotQuery(doctorId, dateKey));
          busyByDay.set(`${doctorId}|${dateKey}`, snapshot.docs.map((doc) => {
            const data = doc.data();
            return { status: data.status, proposalId: data.proposalId || null, startsAt: millis(data.startsAt), endsAt: millis(data.endsAt), expiry: millis(data.expiresAt) };
          }).filter((item) => ['booked', 'held', 'blocked'].includes(item.status) && !(item.status === 'held' && Number.isFinite(item.expiry) && item.expiry <= now().getTime())));
        }
      }
      const phoneActive = new Map();
      for (const phone of [...new Set(candidates.map((row) => row.phoneKey).filter(Boolean))]) {
        const snapshot = await transaction.get(collection('appointments').where('phoneKey', '==', phone).where('status', 'in', ['scheduled', 'confirmed']).limit(3));
        phoneActive.set(phone, snapshot.docs.filter((doc) => countsAsAppointment(doc.data())).length);
      }
      const claimed = [];
      current.forEach((snapshot, index) => {
        if (!snapshot.exists) { outcomes.push({ requestId: candidates[index].id, status: 'skipped', reason: 'This request no longer exists.' }); return; }
        const row = { id: snapshot.id, ref: snapshot.ref, ...snapshot.data() };
        const candidate = candidates[index];
        if (row.status === 'confirmed') { outcomes.push({ requestId: row.id, status: 'confirmed', appointmentId: row.appointmentId, idempotent: true }); return; }
        if (row.status !== 'pending') { outcomes.push({ requestId: row.id, status: 'skipped', reason: 'This request is no longer awaiting approval.' }); return; }
        const service = settings.visitTypes.find((item) => item.id === row.serviceId && item.active);
        const assignment = assignments[row.id] || {};
        const dateKey = text(assignment.dateKey, 10) || row.requested?.dateKey;
        const time = text(assignment.time, 5) || row.requested?.time;
        const doctor = catalog.doctors.find((item) => item.id === row.doctorId);
        if (!DATE_KEY.test(dateKey || '') || !TIME.test(time || '')) {
          // Missing input is not a scheduling conflict: leave the request pending
          // instead of recording a decline the clinic did not decide.
          outcomes.push({ requestId: row.id, status: 'skipped', reason: 'Choose a permitted date and time before approving.' });
          return;
        }
        if (!doctor) {
          outcomes.push({ requestId: row.id, status: 'skipped', reason: 'The selected doctor is no longer available.' });
          return;
        }
        const plan = planPromotion({
          policyValue, settings, service, mode: row.mode, locationId: row.locationId || null,
          doctorId: row.doctorId, dateKey, time,
          busy: busyByDay.get(`${row.doctorId}|${dateKey}`) || [],
          claimed,
          phoneBlocked: row.phoneKey ? (phoneActive.get(row.phoneKey) || 0) >= 2 : false,
        });
        if (!plan.ok) {
          const at = FieldValue.serverTimestamp();
          transaction.update(row.ref, {
            status: 'declined', declineCode: plan.code, declineReason: plan.reason,
            decidedBy: actor.uid, decidedByRole: actor.role, declinedAt: at, updatedAt: at,
            version: FieldValue.increment(1),
          });
          transaction.set(row.ref.collection('events').doc(), { action: 'consultation_request_declined', from: 'pending', to: 'declined', byUid: actor.uid, byRole: actor.role, at, reason: plan.reason, meta: { code: plan.code, batch: true } });
          transaction.set(collection('auditLogs').doc(), { at, actor: { uid: actor.uid, role: actor.role }, action: 'consultation_request_declined', resource: { type: 'consultation_request', id: row.id }, meta: { code: plan.code, batch: true } });
          writeNotification(transaction, { channel: row.accountUid ? 'portal' : 'clinic_console', template: 'consultation_declined', recipient: row.accountUid || null, reference: row.reference, email: row.patient?.email || null, at });
          outcomes.push({ requestId: row.id, status: 'declined', code: plan.code, reason: plan.reason });
          return;
        }
        claimed.push({
          start: plan.startsAt.getTime() - settings.bufferBeforeMinutes * 60 * 1000,
          end: plan.endsAt.getTime() + settings.bufferAfterMinutes * 60 * 1000,
        });
        const appointmentRef = collection('appointments').doc();
        const promoted = promote(transaction, {
          requestDoc: row, actor, appointmentRef, service, mode: row.mode, locationId: row.locationId || null,
          doctor, dateKey, time, startsAt: plan.startsAt, endsAt: plan.endsAt, unitIds: plan.unitIds,
          consent: row.consent, acceptedProposal: null, supersededProposals: [],
        });
        confirmations.push(promoted.appointmentId);
        outcomes.push({ requestId: row.id, status: 'confirmed', ...promoted });
      });
    });
    await Promise.all(confirmations.map((appointmentId) => syncAppointment(appointmentId)));
    // Outcomes keep the deterministic submission-time/id order of the batch.
    return {
      outcomes,
      confirmed: outcomes.filter((row) => row.status === 'confirmed').length,
      declined: outcomes.filter((row) => row.status === 'declined').length,
      idempotent: outcomes.every((row) => row.idempotent === true),
    };
  }

  // --- Proposals ----------------------------------------------------------
  async function offerProposal(request) {
    const actor = await staffActor(request);
    const requestId = text(request.data?.requestId, 128);
    const dateKey = text(request.data?.dateKey, 10);
    const time = text(request.data?.time, 5);
    if (!DOC_ID.test(requestId) || !DATE_KEY.test(dateKey) || !TIME.test(time)) throw fail('invalid-argument', 'Choose a valid request, date and time.');
    const [policyValue, settings, catalog] = await Promise.all([policy(), config(), catalogue()]);
    const requestRef = collection(REQUESTS).doc(requestId);
    const token = accessToken();
    let result;
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(requestRef);
      if (!snapshot.exists) throw fail('not-found', 'Consultation request not found.');
      const row = { id: snapshot.id, ref: snapshot.ref, ...snapshot.data() };
      if (actor.role === 'doctor' && row.doctorId !== actor.doctorId) throw fail('permission-denied', 'You can only offer times for your own consultation requests.');
      if (!requestOpen(row.status)) throw fail('failed-precondition', 'This request can no longer receive an alternative time.');
      const service = settings.visitTypes.find((item) => item.id === row.serviceId && item.active);
      if (!service) throw fail('failed-precondition', 'The requested appointment format is no longer available.');
      const busies = await transaction.get(daySlotQuery(row.doctorId, dateKey));
      const busy = busies.docs.map((doc) => {
        const data = doc.data();
        return { status: data.status, proposalId: data.proposalId || null, startsAt: millis(data.startsAt), endsAt: millis(data.endsAt), expiry: millis(data.expiresAt) };
      }).filter((item) => ['booked', 'held', 'blocked'].includes(item.status) && !(item.status === 'held' && Number.isFinite(item.expiry) && item.expiry <= now().getTime()));
      const doctor = catalog.doctors.find((item) => item.id === row.doctorId);
      if (!doctor) throw fail('failed-precondition', 'The selected doctor is no longer available.');
      const plan = planPromotion({ policyValue, settings, service, mode: row.mode, locationId: row.locationId || null, doctorId: row.doctorId, dateKey, time, busy });
      if (!plan.ok) throw fail('failed-precondition', plan.reason);
      const existing = await transaction.get(collection(PROPOSALS).where('requestId', '==', requestId).where('status', '==', 'pending').limit(MAX_PROPOSALS_PER_REQUEST));
      if (existing.size >= MAX_PROPOSALS_PER_REQUEST) throw fail('failed-precondition', 'This request already has the maximum number of open proposed times.');
      const proposalRef = collection(PROPOSALS).doc();
      const at = FieldValue.serverTimestamp();
      const expiresAt = proposalExpiry(now(), settingsPolicyLifetime(policyValue));
      transaction.set(proposalRef, {
        requestId, requestReference: row.reference, doctorId: row.doctorId, mode: row.mode,
        locationId: row.locationId || null, serviceId: service.id, serviceLabel: service.label,
        dateKey, time, startsAt: Timestamp.fromDate(plan.startsAt), endsAt: Timestamp.fromDate(plan.endsAt),
        unitIds: plan.unitIds, status: 'pending',
        expiresAt: Timestamp.fromDate(expiresAt),
        accessTokenHash: hashToken(token),
        createdBy: { uid: actor.uid, role: actor.role },
        createdAt: at, updatedAt: at, version: 1,
      });
      plan.unitIds.forEach((slotId, index) => {
        const unitStartsAt = unitStarts({ startsAt: plan.startsAt, endsAt: plan.endsAt })[index];
        transaction.set(collection('appointmentSlots').doc(slotId), {
          doctorId: row.doctorId, dateKey,
          startsAt: Timestamp.fromDate(unitStartsAt),
          endsAt: Timestamp.fromDate(new Date(unitStartsAt.getTime() + SLOT_MINUTES * 60 * 1000)),
          proposalId: proposalRef.id,
          status: 'held',
          expiresAt: Timestamp.fromDate(expiresAt),
          createdAt: at,
        });
      });
      transaction.update(requestRef, {
        status: 'proposal_pending',
        proposedAt: at,
        updatedAt: at,
        version: FieldValue.increment(1),
      });
      transaction.set(requestRef.collection('events').doc(), { action: 'consultation_proposal_offered', from: row.status, to: 'proposal_pending', byUid: actor.uid, byRole: actor.role, at, meta: { proposalId: proposalRef.id } });
      transaction.set(collection('auditLogs').doc(), { at, actor: { uid: actor.uid, role: actor.role }, action: 'consultation_proposal_offered', resource: { type: 'consultation_request', id: requestId }, meta: { proposalId: proposalRef.id, dateKey, time, requestReference: row.reference } });
      transaction.set(collection('notifications').doc(), {
        channel: row.accountUid ? 'portal' : 'clinic_console', template: 'consultation_proposal_offered',
        recipient: row.accountUid || null, reference: row.reference, status: 'queued', attempts: 0, sendAfter: at,
        email: { configured: EMAIL_DELIVERY_CONFIGURED, to: row.patient?.email || null }, createdAt: at,
      });
      result = { proposalId: proposalRef.id, requestId, status: 'pending', dateKey, time, expiresAt: expiresAt.toISOString(), accessToken: token };
    });
    return result;
  }

  const settingsPolicyLifetime = (policyValue) => Number.isInteger(policyValue.proposalLifetimeHours)
    ? policyValue.proposalLifetimeHours
    : DEFAULT_PROPOSAL_LIFETIME_HOURS;

  async function proposalsForTransaction(transaction, requestId) {
    const snapshot = await transaction.get(collection(PROPOSALS).where('requestId', '==', requestId));
    return snapshot.docs.map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }));
  }

  async function slotRowsForProposal(transaction, proposal) {
    const unitIds = proposal.unitIds || [];
    const snapshots = await Promise.all(unitIds.map((slotId) => transaction.get(collection('appointmentSlots').doc(slotId))));
    return snapshots.map((snapshot, index) => ({ slotId: unitIds[index], exists: snapshot.exists, ...(snapshot.exists ? snapshot.data() : {}) }));
  }

  async function respondToProposal(request) {
    const input = request.data || {};
    const proposalId = text(input.proposalId, 128);
    const token = text(input.token, 200);
    const accept = input.accept !== false;
    const reason = text(input.reason, 300);
    if (!DOC_ID.test(proposalId)) throw fail('invalid-argument', 'Choose a valid proposed time.');
    const initial = await collection(PROPOSALS).doc(proposalId).get();
    if (!initial.exists) throw fail('not-found', 'This proposed time was not found.');
    const initialProposal = initial.data();
    const requestSnapshot = await collection(REQUESTS).doc(initialProposal.requestId).get();
    if (!requestSnapshot.exists) throw fail('not-found', 'This consultation request was not found.');
    const requestRow = requestSnapshot.data();
    const tokenMatches = Boolean(token) && initialProposal.accessTokenHash === hashToken(token);
    const accountMatches = Boolean(request.auth?.uid) && requestRow.accountUid === request.auth.uid;
    // Unauthorised acceptance never releases capacity or reveals request detail.
    if (!tokenMatches && !accountMatches) throw fail('permission-denied', 'This proposed time can only be answered by the patient it was sent to.');
    if (request.auth && ['admin', 'doctor', 'manager'].includes(request.auth.token?.role)) throw fail('permission-denied', 'Staff cannot answer a patient proposal.');

    const [policyValue, settings, catalog] = await Promise.all([policy(), config(), catalogue()]);
    let result;
    await db.runTransaction(async (transaction) => {
      const proposalSnapshot = await transaction.get(initial.ref);
      const requestRef = collection(REQUESTS).doc(initialProposal.requestId);
      const freshRequest = await transaction.get(requestRef);
      if (!proposalSnapshot.exists || !freshRequest.exists) throw fail('not-found', 'This proposed time was not found.');
      const proposal = { id: proposalSnapshot.id, ref: proposalSnapshot.ref, ...proposalSnapshot.data() };
      const row = { id: freshRequest.id, ref: freshRequest.ref, ...freshRequest.data() };
      if (proposal.status === 'accepted' && row.status === 'confirmed') {
        result = { proposalId, status: 'accepted', appointmentId: row.appointmentId, idempotent: true };
        return;
      }
      if (proposal.status !== 'pending') throw fail('failed-precondition', 'This proposed time is no longer open. Please contact the clinic.');
      const at = FieldValue.serverTimestamp();
      // A parallel acceptance of another proposed time already confirmed this
      // request. Retire this one instead of creating a second appointment.
      if (row.status === 'confirmed') {
        releaseProposalHolds(transaction, proposal);
        transaction.update(proposal.ref, { status: 'superseded', supersededAt: at, updatedAt: at, version: FieldValue.increment(1) });
        transaction.set(proposal.ref.collection('events').doc(), { action: 'proposal_superseded', from: 'pending', to: 'superseded', byRole: 'system', at, meta: { appointmentId: row.appointmentId } });
        transaction.set(collection('auditLogs').doc(), { at, actor: { uid: request.auth?.uid || null, role: 'patient' }, action: 'consultation_proposal_superseded', resource: { type: 'consultation_request', id: row.id }, meta: { proposalId, appointmentId: row.appointmentId } });
        result = { proposalId, status: 'superseded', appointmentId: row.appointmentId, idempotent: true };
        return;
      }
      const expiresAt = millis(proposal.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= now().getTime()) {
        // Expiry is a real transition with its own audit trail, even when a patient
        // happens to be the first to notice it.
        releaseProposalHolds(transaction, proposal);
        transaction.update(proposal.ref, { status: 'expired', expiredAt: at, updatedAt: at, version: FieldValue.increment(1) });
        transaction.set(proposal.ref.collection('events').doc(), { action: 'proposal_expired', from: 'pending', to: 'expired', byRole: 'system', at, meta: { code: 'PROPOSAL_EXPIRED' } });
        transaction.set(collection('auditLogs').doc(), { at, actor: { uid: null, role: 'system' }, action: 'consultation_proposal_expired', resource: { type: 'consultation_request', id: row.id }, meta: { proposalId, code: 'PROPOSAL_EXPIRED' } });
        transaction.update(requestRef, { status: 'pending', updatedAt: at, version: FieldValue.increment(1) });
        // Throwing here would roll the audited expiry transition back, so the
        // refusal is raised after the transaction commits.
        result = { expired: true };
        return;
      }
      if (!accept) {
        releaseProposalHolds(transaction, proposal);
        transaction.update(proposal.ref, { status: 'declined', declinedAt: at, declineReason: reason || 'Declined by patient', updatedAt: at, version: FieldValue.increment(1) });
        transaction.set(proposal.ref.collection('events').doc(), { action: 'proposal_declined', from: 'pending', to: 'declined', byRole: 'patient', at, reason: reason || null });
        transaction.set(collection('auditLogs').doc(), { at, actor: { uid: request.auth?.uid || null, role: 'patient' }, action: 'consultation_proposal_declined', resource: { type: 'consultation_request', id: row.id }, meta: { proposalId } });
        transaction.update(requestRef, { status: 'pending', updatedAt: at, version: FieldValue.increment(1) });
        result = { proposalId, status: 'declined', idempotent: false };
        return;
      }

      const service = settings.visitTypes.find((item) => item.id === proposal.serviceId && item.active);
      const doctor = catalog.doctors.find((item) => item.id === proposal.doctorId);
      if (!service || !doctor) throw fail('failed-precondition', 'The clinic can no longer confirm this appointment format. Please contact the clinic.');
      const [holds, otherProposals, patients] = await Promise.all([
        slotRowsForProposal(transaction, proposal),
        proposalsForTransaction(transaction, row.id),
        row.phoneKey
          ? transaction.get(collection('appointments').where('phoneKey', '==', row.phoneKey).where('status', 'in', ['scheduled', 'confirmed']).limit(3))
          : Promise.resolve(null),
      ]);
      const holdLost = holds.some((hold) => !hold.exists || hold.status !== 'held' || hold.proposalId !== proposal.id);
      if (holdLost) throw fail('failed-precondition', 'This proposed time is no longer held. Please contact the clinic.');
      const busies = await transaction.get(daySlotQuery(proposal.doctorId, proposal.dateKey));
      const busy = busies.docs.map((doc) => {
        const data = doc.data();
        return { status: data.status, proposalId: data.proposalId || null, startsAt: millis(data.startsAt), endsAt: millis(data.endsAt), expiry: millis(data.expiresAt) };
      }).filter((item) => ['booked', 'held', 'blocked'].includes(item.status) && !(item.status === 'held' && Number.isFinite(item.expiry) && item.expiry <= now().getTime()));
      const phoneBlocked = Boolean(patients && patients.docs.filter((doc) => countsAsAppointment(doc.data())).length >= 2);
      const plan = planPromotion({
        policyValue, settings, service, mode: proposal.mode, locationId: proposal.locationId || null,
        doctorId: proposal.doctorId, dateKey: proposal.dateKey, time: proposal.time,
        busy, allowProposalId: proposal.id, phoneBlocked,
      });
      if (!plan.ok) throw fail('failed-precondition', plan.reason);
      const superseded = otherProposals.filter((item) => item.id !== proposal.id && item.status === 'pending');
      // Release every superseded proposal's hold; slots are re-read below only for
      // the accepted proposal, so deletion of unrelated units is safe and audited.
      const appointmentRef = collection('appointments').doc();
      const promoted = promote(transaction, {
        requestDoc: row, actor: { uid: request.auth?.uid || null, role: 'patient' },
        appointmentRef, service, mode: proposal.mode, locationId: proposal.locationId || null,
        doctor, dateKey: proposal.dateKey, time: proposal.time,
        startsAt: plan.startsAt, endsAt: plan.endsAt, unitIds: plan.unitIds,
        consent: row.consent, acceptedProposal: proposal, supersededProposals: superseded,
      });
      result = { proposalId, status: 'accepted', idempotent: false, ...promoted };
    });
    if (result.expired) throw fail('failed-precondition', 'This proposed time has expired. Please contact the clinic for another time.');
    if (!result.idempotent && result.appointmentId) await syncAppointment(result.appointmentId);
    return result;
  }

  // Expiry sweep. Bounded, deterministic by expiry, one audit trail per proposal.
  async function expireProposals(request) {
    const actor = await staffActor(request, ['admin', 'doctor', 'manager']);
    const limitInput = Number(request.data?.limit);
    const limit = Number.isInteger(limitInput) ? Math.min(Math.max(limitInput, 1), 50) : 25;
    const due = await collection(PROPOSALS)
      .where('status', '==', 'pending')
      .where('expiresAt', '<=', Timestamp.fromDate(now()))
      .orderBy('expiresAt', 'asc')
      .limit(limit)
      .get();
    const expired = [];
    for (const doc of due.docs) {
      const proposal = { id: doc.id, ref: doc.ref, ...doc.data() };
      if (actor.role === 'doctor' && proposal.doctorId !== actor.doctorId) continue;
      await db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(doc.ref);
        if (!snapshot.exists || snapshot.get('status') !== 'pending') return;
        const current = { id: snapshot.id, ref: snapshot.ref, ...snapshot.data() };
        const requestRef = collection(REQUESTS).doc(current.requestId);
        const requestSnapshot = await transaction.get(requestRef);
        const at = FieldValue.serverTimestamp();
        releaseProposalHolds(transaction, current);
        transaction.update(doc.ref, { status: 'expired', expiredAt: at, updatedAt: at, version: FieldValue.increment(1) });
        transaction.set(doc.ref.collection('events').doc(), { action: 'proposal_expired', from: 'pending', to: 'expired', byRole: 'system', at });
        transaction.set(collection('auditLogs').doc(), { at, actor: { uid: actor.uid, role: actor.role }, action: 'consultation_proposal_expired', resource: { type: 'consultation_request', id: current.requestId }, meta: { proposalId: current.id } });
        if (requestSnapshot.exists && ['pending', 'proposal_pending'].includes(requestSnapshot.get('status'))) {
          transaction.update(requestRef, { status: 'pending', updatedAt: at, version: FieldValue.increment(1) });
        }
        transaction.set(collection('notifications').doc(), {
          channel: requestSnapshot.get('accountUid') ? 'portal' : 'clinic_console', template: 'consultation_proposal_expired',
          recipient: requestSnapshot.get('accountUid') || null, reference: current.requestReference, status: 'queued', attempts: 0, sendAfter: at,
          email: { configured: EMAIL_DELIVERY_CONFIGURED, to: requestSnapshot.get('patient.email') || null }, createdAt: at,
        });
        expired.push(current.id);
      });
    }
    return { expired: expired.length, proposalIds: expired };
  }

  // --- Patient/guest access to their own request --------------------------
  async function authorizeRequestAccess(request, row, token) {
    if (token && row.accessTokenHash === hashToken(token)) return;
    if (request.auth?.uid && row.accountUid === request.auth.uid) return;
    throw fail('permission-denied', 'This consultation link is not valid. Please contact the clinic.');
  }

  async function findRequest(request) {
    const referenceValue = text(request.data?.reference, 20).toUpperCase();
    if (!REFERENCE.test(referenceValue)) throw fail('invalid-argument', 'Enter a valid consultation reference.');
    const snapshot = await collection(REQUESTS).where('reference', '==', referenceValue).limit(1).get();
    if (snapshot.empty) throw fail('not-found', 'Consultation request not found.');
    const doc = snapshot.docs[0];
    return { id: doc.id, ref: doc.ref, ...doc.data() };
  }

  async function getRequestStatus(request) {
    const row = await findRequest(request);
    await authorizeRequestAccess(request, row, text(request.data?.token, 200));
    const [policyValue, settings, proposals] = await Promise.all([
      policy(),
      config(),
      collection(PROPOSALS).where('requestId', '==', row.id).orderBy('createdAt', 'asc').limit(6).get(),
    ]);
    let appointment = null;
    if (row.appointmentId) {
      const snapshot = await collection('appointments').doc(row.appointmentId).get();
      if (snapshot.exists) {
        const data = snapshot.data();
        const startsAt = millis(data.startsAt);
        appointment = {
          reference: data.reference,
          status: data.status,
          startsAt: iso(data.startsAt),
          endsAt: iso(data.endsAt),
          dateKey: data.dateKey,
          mode: data.visitMode,
          locationId: data.locationId || null,
          // The secure link/token is itself the authorisation; the cutoff still
          // applies so a private cancellation cannot bypass clinic policy.
          canCancel: Boolean(activeStatus(data.status)
            && startsAt - settings.cancelCutoffMinutes * 60 * 1000 > now().getTime()),
        };
      }
    }
    const location = row.locationId ? locationFor(policyValue, row.locationId) : null;
    return {
      reference: row.reference,
      status: row.status,
      mode: row.mode,
      service: { id: row.serviceId, label: row.serviceLabel, minutes: row.durationMinutes },
      location: location ? { id: location.id, name: location.name, address: location.address } : null,
      requested: row.requested || null,
      proposalStatus: row.status === 'proposal_pending' ? 'awaiting_patient' : null,
      proposals: proposals.docs.map((doc) => ({ proposalId: doc.id, dateKey: doc.get('dateKey'), time: doc.get('time'), status: doc.get('status'), expiresAt: iso(doc.get('expiresAt')) })).filter((item) => item.status === 'pending'),
      appointment,
      declineReason: row.declineReason || null,
    };
  }

  async function cancelRequest(request) {
    const row = await findRequest(request);
    await authorizeRequestAccess(request, row, text(request.data?.token, 200));
    const reason = text(request.data?.reason, 300) || 'Cancelled by patient';
    const settings = await config();
    let result;
    await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(row.ref);
      if (!snapshot.exists) throw fail('not-found', 'Consultation request not found.');
      const current = { id: snapshot.id, ref: snapshot.ref, ...snapshot.data() };
      if (current.status === 'cancelled') { result = { ok: true, status: 'cancelled', idempotent: true }; return; }
      if (!['pending', 'proposal_pending', 'confirmed'].includes(current.status)) throw fail('failed-precondition', 'This consultation can no longer be cancelled online. Please contact the clinic.');
      const at = FieldValue.serverTimestamp();
      let appointmentSnapshot = null;
      if (current.status === 'confirmed' && current.appointmentId) {
        appointmentSnapshot = await transaction.get(collection('appointments').doc(current.appointmentId));
      }
      const proposals = await proposalsForTransaction(transaction, current.id);
      if (appointmentSnapshot?.exists) {
        const appointment = appointmentSnapshot.data();
        if (!activeStatus(appointment.status)) throw fail('failed-precondition', 'This appointment can no longer be cancelled online. Please contact the clinic.');
        if (millis(appointment.startsAt) - settings.cancelCutoffMinutes * 60 * 1000 <= now().getTime()) throw fail('failed-precondition', 'This appointment can no longer be cancelled online. Please contact the clinic.');
        (appointment.slotIds || []).forEach((slotId) => transaction.delete(collection('appointmentSlots').doc(slotId)));
        transaction.update(appointmentSnapshot.ref, {
          status: 'cancelled',
          cancellation: { byUid: request.auth?.uid || null, byRole: 'patient', reason, at },
          updatedAt: at,
        });
        transaction.set(appointmentSnapshot.ref.collection('events').doc(), { from: appointment.status, to: 'cancelled', byUid: request.auth?.uid || null, byRole: 'patient', reason, at });
      }
      proposals.filter((proposal) => proposal.status === 'pending').forEach((proposal) => {
        releaseProposalHolds(transaction, proposal);
        transaction.update(proposal.ref, { status: 'declined', declineReason: 'Consultation request cancelled', updatedAt: at, version: FieldValue.increment(1) });
      });
      transaction.update(current.ref, { status: 'cancelled', cancelledAt: at, cancellationReason: reason, updatedAt: at, version: FieldValue.increment(1) });
      transaction.set(current.ref.collection('events').doc(), { action: 'consultation_request_cancelled', from: current.status, to: 'cancelled', byUid: request.auth?.uid || null, byRole: 'patient', at, reason });
      transaction.set(collection('auditLogs').doc(), { at, actor: { uid: request.auth?.uid || null, role: 'patient' }, action: 'consultation_request_cancelled', resource: { type: 'consultation_request', id: current.id }, meta: { requestReference: current.reference, appointmentId: current.appointmentId || null } });
      result = { ok: true, status: 'cancelled', idempotent: false };
    });
    if (!result.idempotent && row.appointmentId) await unsyncAppointment(row.appointmentId);
    return result;
  }

  // --- Scheduling policy administration -----------------------------------
  async function savePolicy(request) {
    const actor = await staffActor(request, ['admin']);
    const { validatePolicyDocument } = require('./consultationPolicy');
    let document;
    try { document = validatePolicyDocument(request.data?.policy); } catch (error) { throw fail('invalid-argument', error.message); }
    await collection('clinic').doc('consultationPolicy').set({
      ...document,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actor.uid,
    }, { merge: true });
    await collection('auditLogs').add({
      at: FieldValue.serverTimestamp(),
      actor: { uid: actor.uid, role: actor.role },
      action: 'consultation_policy_saved',
      resource: { type: 'consultation_policy', id: 'consultationPolicy' },
      meta: {
        locations: document.locations.map((location) => location.id),
        closedWeekdays: document.closedWeekdays,
        proposalLifetimeHours: document.proposalLifetimeHours,
        services: Object.keys(document.services),
      },
    });
    return { saved: true, policy: document };
  }

  async function getPolicy(request) {
    await staffActor(request, ['admin', 'doctor', 'manager']);
    return { policy: await policy() };
  }

  return {
    getOptions,
    getAvailability,
    submitRequest,
    listRequests,
    listProposals,
    approveRequest,
    declineRequest,
    bulkApprove,
    offerProposal,
    respondToProposal,
    expireProposals,
    getRequestStatus,
    cancelRequest,
    savePolicy,
    getPolicy,
  };
}

module.exports = { createConsultationWorkflow, EMAIL_DELIVERY_CONFIGURED, MAX_BULK };
