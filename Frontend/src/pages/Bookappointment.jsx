import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { CLINIC_EMAIL, CLINIC_PHONE_DISPLAY, CLINIC_PHONE_TEL } from '../lib/clinicContact';
import { auth, authReady, firestore, functions } from '../lib/firebase';
import { addIstDays, istDateKey, istInstant, toIstParts, weekdayIst } from '../lib/ist';
import { friendlyBookingError } from '../lib/bookingErrors';
import { getBookingCatalog } from '../services/bookingCatalogService';
import { getMonthAvailability, holdSlot, joinWaitlist } from '../services/schedulerService';

const getAvailability = httpsCallable(functions, 'getAvailability');
const createBooking = httpsCallable(functions, 'createBooking');
// Must match CONSENT_VERSION in functions/lib/engine/bookingInput.js: the server rejects a
// booking whose consent version it does not recognise. A1-06 moves this into content/consent.js.
const BOOKING_CONSENT_VERSION = 'booking-v1';
const requestId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const monthKey = (date) => `${toIstParts(date).year}-${String(toIstParts(date).month).padStart(2, '0')}`;
const monthLabel = (date) => date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric' });
const labelDate = (dateKey) => istInstant(dateKey).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });
const formatTime = (time) => {
  const [hour, minute] = time.split(':').map(Number);
  const suffix = hour >= 12 ? 'pm' : 'am';
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`;
};
const buildMonthGrid = (date) => {
  const parts = toIstParts(date);
  const first = `${parts.year}-${String(parts.month).padStart(2, '0')}-01`;
  const offset = (weekdayIst(first) + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => addIstDays(first, index - offset));
};

const Bookappointment = () => {
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState('');
  const [selection, setSelection] = useState({ branchId: '', departmentId: '', doctorId: '', visitTypeId: '' });
  const [month, setMonth] = useState(istInstant(istDateKey()));
  const [selectedDate, setSelectedDate] = useState(istDateKey());
  const [availability, setAvailability] = useState({});
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [status, setStatus] = useState('loading');
  const [step, setStep] = useState('schedule');
  const [form, setForm] = useState({ name: '', phone: '', email: '', sex: '', ageYears: '', dob: '', visitKind: 'new', reason: '', consent: false });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [waitlistStatus, setWaitlistStatus] = useState('');

  const doctors = useMemo(() => (catalog?.doctors || []).filter((item) => item.branchId === selection.branchId && item.departmentIds.includes(selection.departmentId)), [catalog, selection]);
  const visitTypes = catalog?.visitTypes?.length ? catalog.visitTypes : catalog?.booking?.visitTypes || [];
  const selectedDoctor = doctors.find((item) => item.id === selection.doctorId);
  const selectedVisitType = visitTypes.find((item) => item.id === selection.visitTypeId);
  const grid = useMemo(() => buildMonthGrid(month), [month]);
  const today = istDateKey();
  const maxDate = addIstDays(today, selectedVisitType?.maxAdvanceDays || catalog?.booking?.bookingWindowDays || 14);
  const currentMonth = monthKey(istInstant(today));
  const canGoPrevious = monthKey(month) > currentMonth;

  useEffect(() => {
    let active = true;
    getBookingCatalog().then(async (data) => {
      const branch = data.branches?.[0];
      const department = data.departments?.find((item) => item.branchId === branch?.id);
      const doctor = data.doctors?.find((item) => item.branchId === branch?.id && item.departmentIds.includes(department?.id));
      const type = data.visitTypes?.[0] || data.booking?.visitTypes?.[0];
      if (!branch || !department || !doctor || !type) throw new Error('Online booking is not available right now.');
      if (active) {
        setCatalog(data);
        setSelection({ branchId: branch.id, departmentId: department.id, doctorId: doctor.id, visitTypeId: type.id });
      }
    }).catch((caught) => active && setCatalogError(caught.message || 'Online booking is temporarily unavailable.'))
      .finally(() => active && setStatus('ready'));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    authReady.then(async () => {
      const user = auth.currentUser;
      if (!user) return;
      const profile = await getDoc(doc(firestore, 'patients', user.uid)).catch(() => null);
      if (active) setForm((current) => ({ ...current, name: current.name || profile?.get('displayName') || user.displayName || '', phone: current.phone || profile?.get('phone') || '' }));
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!selection.doctorId || !selection.visitTypeId) return undefined;
    let active = true;
    const dates = [...new Set(grid)].filter((dateKey) => dateKey >= today && dateKey <= maxDate);
    setAvailability((current) => Object.fromEntries(dates.map((dateKey) => [dateKey, current[dateKey] || { loading: true }])));
    getMonthAvailability({ doctorId: selection.doctorId, month: monthKey(month), visitTypeId: selection.visitTypeId })
      .then((data) => {
        if (!active) return;
        const entries = (data.days || []).map((day) => [day.dateKey, { available: day.available, slotCount: day.slotCount }]);
        setAvailability((current) => ({ ...current, ...Object.fromEntries(entries) }));
      })
      .catch(() => {
        if (active) setAvailability((current) => ({ ...current, ...Object.fromEntries(dates.map((dateKey) => [dateKey, { available: false, slotCount: 0, error: true }])) }));
      });
    return () => { active = false; };
  }, [grid, maxDate, month, selection.doctorId, selection.visitTypeId, today]);

  useEffect(() => {
    if (!selection.doctorId || !selection.visitTypeId || selectedDate < today || selectedDate > maxDate) return undefined;
    let active = true;
    setSlots([]);
    setSelectedSlot(null);
    setError('');
    // schedulerService returns the callable payload, not a `{ data }` envelope.
    getAvailability({ doctorId: selection.doctorId, dateKey: selectedDate, visitTypeId: selection.visitTypeId })
      .then((data) => active && setSlots(data?.slots || []))
      .catch((caught) => active && setError(friendlyBookingError(caught)));
    return () => { active = false; };
  }, [maxDate, selectedDate, selection.doctorId, selection.visitTypeId, today]);

  const chooseBranch = (branchId) => {
    const department = catalog.departments.find((item) => item.branchId === branchId);
    const doctor = catalog.doctors.find((item) => item.branchId === branchId && item.departmentIds.includes(department?.id));
    setSelection((current) => ({ ...current, branchId, departmentId: department?.id || '', doctorId: doctor?.id || '' }));
  };
  const submit = async (event) => {
    event.preventDefault();
    if (!selectedSlot) return setError('Choose an available time first.');
    if (!form.consent) return setError('Please accept the consent to continue.');
    setSaving(true); setError('');
    try {
      await authReady;
      const hold = await holdSlot({ doctorId: selection.doctorId, dateKey: selectedDate, time: selectedSlot.time, visitTypeId: selection.visitTypeId });
      const { data } = await createBooking({
        doctorId: selection.doctorId, visitTypeId: selection.visitTypeId,
        startsAt: selectedSlot.startsAt || istInstant(selectedDate, selectedSlot.time).toISOString(),
        // holdSlot still returns its secret as `holdToken` until A1-03 renames the contract.
        holdId: hold.holdToken, clientRequestId: requestId(),
        patient: { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() || undefined, sex: form.sex || undefined, ageYears: form.ageYears ? Number(form.ageYears) : undefined, dob: form.dob || undefined, visitKind: form.visitKind },
        reason: form.reason.trim() || undefined,
        consent: { version: BOOKING_CONSENT_VERSION },
      });
      setConfirmation({ ...data, dateKey: selectedDate, time: selectedSlot.time, doctor: selectedDoctor, visitType: selectedVisitType });
    } catch (caught) {
      setError(friendlyBookingError(caught));
    } finally { setSaving(false); }
  };
  const joinWhenFull = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      setError('Enter your name and mobile number to join the waitlist.');
      return;
    }
    setWaitlistStatus('joining');
    setError('');
    try {
      await joinWaitlist({ doctorId: selection.doctorId, visitTypeId: selection.visitTypeId, dateKey: selectedDate, name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() || undefined });
      setWaitlistStatus('joined');
    } catch (caught) {
      setWaitlistStatus('');
      setError(friendlyBookingError(caught));
    }
  };

  if (confirmation) return <><Navbar /><main className="booking-page"><section className="booking-success"><span className="booking-success__check">✓</span><p className="section-kicker">Appointment confirmed</p><h1>You’re booked</h1><p>Your {confirmation.visitType?.label || 'appointment'} with {confirmation.doctor?.name || 'the clinic'} is reserved.</p><div className="booking-success__details"><strong>{labelDate(confirmation.dateKey)} at {formatTime(confirmation.time)}</strong><span>Reference <b>{confirmation.reference}</b></span></div>{confirmation.manageToken && <a className="scheduler-next" href={`/booking/${confirmation.reference}?token=${encodeURIComponent(confirmation.manageToken)}`}>Manage this appointment</a>}<p className="booking-message">Need help? Call <a href={`tel:${CLINIC_PHONE_TEL}`}>{CLINIC_PHONE_DISPLAY}</a> or email <a href={`mailto:${CLINIC_EMAIL}`}>{CLINIC_EMAIL}</a>.</p><button type="button" onClick={() => { setConfirmation(null); setStep('schedule'); }}>Book another appointment</button></section></main><Footer /></>;

  return <><Navbar /><main className="booking-page booking-page--scheduler"><section className="booking-page__intro"><p>SOOD CLINIC · PANCHKULA</p><h1>Book your consultation</h1><span>Choose a visit type, find a time that works, and confirm in under a minute.</span></section><section className="scheduler-card">{catalogError ? <p className="booking-message" role="alert">{catalogError}</p> : status === 'loading' ? <div className="scheduler-loading">Loading available appointments…</div> : <><aside className="scheduler-summary"><span className="section-kicker">Your visit</span><h2>{selectedVisitType?.label || 'Consultation'}</h2><p>{selectedVisitType?.minutes || 20} minutes · {selectedVisitType?.mode === 'video' ? 'Video visit' : 'In clinic'}</p><label>Visit type<select value={selection.visitTypeId} onChange={(event) => setSelection({ ...selection, visitTypeId: event.target.value })}>{visitTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>{catalog.branches?.length > 1 && <label>Location<select value={selection.branchId} onChange={(event) => chooseBranch(event.target.value)}>{catalog.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}<label>Doctor<select value={selection.doctorId} onChange={(event) => setSelection({ ...selection, doctorId: event.target.value })}>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></label>{step !== 'schedule' && <button type="button" className="scheduler-link" onClick={() => setStep('schedule')}>Change time</button>}</aside><div className="scheduler-main">{step === 'schedule' ? <><div className="scheduler-month-header"><button type="button" aria-label="Previous month" disabled={!canGoPrevious} onClick={() => setMonth(istInstant(addIstDays(`${toIstParts(month).year}-${String(toIstParts(month).month).padStart(2, '0')}-01`, -1)))}>‹</button><h2>{monthLabel(month)}</h2><button type="button" aria-label="Next month" onClick={() => setMonth(istInstant(addIstDays(`${toIstParts(month).year}-${String(toIstParts(month).month).padStart(2, '0')}-01`, 32)))}>›</button></div><div className="scheduler-calendar" role="grid" aria-label="Choose a date">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day} className="scheduler-weekday">{day}</span>)}{grid.map((dateKey) => { const inMonth = monthKey(istInstant(dateKey)) === monthKey(month); const day = toIstParts(istInstant(dateKey)).day; const info = availability[dateKey]; const disabled = !inMonth || dateKey < today || dateKey > maxDate || (!info?.available && !info?.loading); return <button key={dateKey} type="button" role="gridcell" disabled={disabled} aria-label={dateKey} className={`scheduler-day ${inMonth ? '' : 'scheduler-day--muted'} ${selectedDate === dateKey ? 'scheduler-day--selected' : ''} ${info?.available ? 'scheduler-day--available' : ''}`} onClick={() => { setSelectedDate(dateKey); setError(''); }}><strong>{day}</strong>{dateKey === today && <small>Today</small>}{info?.loading && <i />}</button>; })}</div><p className="scheduler-timezone">Indian Standard Time (IST)</p><div className="scheduler-slots"><h3>{labelDate(selectedDate)}</h3>{error && <p className="booking-message" role="alert">{error}</p>}{slots.length ? <div className="scheduler-slot-list">{slots.map((slot) => <button key={slot.slotId || slot.time} type="button" className={selectedSlot?.time === slot.time ? 'is-selected' : ''} onClick={() => setSelectedSlot(slot)}>{formatTime(slot.time)}</button>)}</div> : <><p className="slot-empty">No times on this day. Join the waitlist and we’ll contact you if a time opens.</p><button type="button" onClick={joinWhenFull} disabled={waitlistStatus === 'joining'}>{waitlistStatus === 'joined' ? 'You are on the waitlist' : waitlistStatus === 'joining' ? 'Joining…' : 'Join waitlist'}</button></>}{selectedSlot && <button type="button" className="scheduler-next" onClick={() => setStep('details')}>Next · {formatTime(selectedSlot.time)}</button>}</div></> : step === 'details' ? <form className="scheduler-details" onSubmit={(event) => { event.preventDefault(); if (!form.name.trim() || !form.phone.trim()) { setError('Enter your name and mobile number.'); return; } if (form.ageYears && (!Number.isInteger(Number(form.ageYears)) || Number(form.ageYears) < 0 || Number(form.ageYears) > 120)) { setError('Enter an age between 0 and 120.'); return; } setError(''); setStep('review'); }}><div className="scheduler-details__summary"><strong>{labelDate(selectedDate)} · {formatTime(selectedSlot.time)}</strong><span>{selectedVisitType?.label} · {selectedVisitType?.minutes} minutes</span></div><label>Full name<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Test Patient" /></label><label>Mobile number<input required type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+91 90000 00001" /></label><div className="patient-form__grid"><label>Sex<select value={form.sex} onChange={(event) => setForm({ ...form, sex: event.target.value })}><option value="">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></label><label>Age<input type="number" min="0" max="120" value={form.ageYears} onChange={(event) => setForm({ ...form, ageYears: event.target.value })} /></label><label>Date of birth<input type="date" value={form.dob} onChange={(event) => setForm({ ...form, dob: event.target.value })} /></label><label>Visit type<select value={form.visitKind} onChange={(event) => setForm({ ...form, visitKind: event.target.value })}><option value="new">New visit</option><option value="follow_up">Follow-up</option></select></label></div><label>Email <small>Optional — we’ll email your confirmation</small><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" /></label><label>Reason for visit <small>Please do not include sensitive details</small><textarea maxLength={500} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></label>{error && <p className="booking-message" role="alert">{error}</p>}<button type="submit">Review appointment</button></form> : <section className="scheduler-details"><div className="scheduler-details__summary"><strong>Review your appointment</strong><span>{labelDate(selectedDate)} · {formatTime(selectedSlot.time)} · {selectedVisitType?.label}</span></div><p><strong>{form.name}</strong><br />{form.phone}{form.email && <><br />{form.email}</>}<br />{form.visitKind === 'follow_up' ? 'Follow-up visit' : 'New visit'}{form.reason && <><br />Reason: {form.reason}</>}</p><label className="booking-consent"><input type="checkbox" checked={form.consent} onChange={(event) => setForm({ ...form, consent: event.target.checked })} /><span>I consent to Sood Clinic using these details to arrange my appointment.</span></label>{error && <p className="booking-message" role="alert">{error}</p>}<button type="button" onClick={submit} disabled={saving}>{saving ? 'Confirming…' : 'Confirm appointment'}</button></section>}</div></>}</section></main><Footer /></>;
};

export default Bookappointment;
