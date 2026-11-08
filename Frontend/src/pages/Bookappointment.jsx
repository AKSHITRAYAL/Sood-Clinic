import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import './bookingJourney.css';
import { auth, authReady, firestore } from '../lib/firebase';
import { addIstDays, istDateKey, istInstant, weekdayIst } from '../lib/ist';
import {
  consultationStatusLink,
  getConsultationAvailability,
  getConsultationOptions,
  submitConsultationRequest,
} from '../services/consultationRequestService';

const labelDate = (dateKey) => istInstant(dateKey).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });
const requestId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const errorCode = (error) => String(error?.code || '').replace('functions/', '');
const friendlyError = (error) => {
  const code = errorCode(error);
  if (code === 'already-exists') return error?.message || 'That request was already used for different details. Please refresh and try again.';
  if (code === 'failed-precondition' || code === 'invalid-argument') return error?.message || 'Some of those details are no longer available. Please review your request.';
  if (code === 'resource-exhausted') return error?.message || 'You have reached the online request limit. Please call the clinic.';
  if (code === 'unavailable') return 'Requesting an appointment is temporarily unavailable. Please call the clinic or try again shortly.';
  return error?.message || 'We could not send your request. Please try again.';
};

const Bookappointment = () => {
  const [searchParams] = useSearchParams();
  const requestedMode = searchParams.get('mode') === 'video' ? 'video' : 'in_person';
  const [options, setOptions] = useState(null);
  const [optionsError, setOptionsError] = useState('');
  const [selection, setSelection] = useState({ serviceId: '', locationId: '', dateKey: istDateKey() });
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [availabilityReady, setAvailabilityReady] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState('service');
  const [result, setResult] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', reason: '', consent: false });
  const [calendarMonth, setCalendarMonth] = useState(istDateKey().slice(0, 7));

  const service = options?.services?.find((item) => item.id === selection.serviceId) || null;
  const inPerson = service?.mode === 'in_person';
  const location = options?.locations?.find((item) => item.id === selection.locationId) || null;
  const slotGroups = useMemo(() => {
    if (!availabilityReady) return [];
    const windows = inPerson ? location?.windows : options?.videoWindows;
    const increment = options?.slotMinutes;
    const duration = service?.minutes;
    const offered = new Map(slots.map((slot) => [slot.time, slot]));
    const candidates = new Map(offered);
    if (Array.isArray(windows) && Number.isInteger(increment) && increment >= 5 && increment <= 240 && Number.isInteger(duration) && duration >= 5 && duration <= 480) {
      windows.forEach(({ start, end }) => {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end || '')) return;
        const mins = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
        for (let at = mins(start); at + duration <= mins(end); at += increment) {
          const time = `${String(Math.floor(at / 60)).padStart(2, '0')}:${String(at % 60).padStart(2, '0')}`;
          if (!candidates.has(time)) candidates.set(time, { time, unavailable: true });
        }
      });
    }
    const groups = { Morning: [], Afternoon: [], Evening: [] };
    [...candidates.values()].sort((a, b) => a.time.localeCompare(b.time)).forEach((slot) => {
      const hour = Number(slot.time.slice(0, 2));
      groups[hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening'].push(slot);
    });
    return Object.entries(groups).filter(([, items]) => items.length);
  }, [slots, availabilityReady, inPerson, location?.windows, options?.videoWindows, options?.slotMinutes, service?.minutes]);
  const days = useMemo(() => {
    const today = istDateKey();
    return Array.from({ length: options?.bookingWindowDays || 0 }, (_, index) => addIstDays(today, index));
  }, [options]);
  const calendarCells = useMemo(() => {
    const [year, month] = calendarMonth.split('-').map(Number);
    const first = `${calendarMonth}-01`;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const leading = weekdayIst(first);
    return [...Array.from({ length: leading }, () => null), ...Array.from({ length: daysInMonth }, (_, index) => `${calendarMonth}-${String(index + 1).padStart(2, '0')}`)];
  }, [calendarMonth]);
  const firstCalendarMonth = days[0]?.slice(0, 7) || calendarMonth;
  const lastCalendarMonth = days.at(-1)?.slice(0, 7) || calendarMonth;
  const shiftCalendarMonth = (delta) => {
    const [year, month] = calendarMonth.split('-').map(Number);
    const next = new Date(Date.UTC(year, month - 1 + delta, 1));
    const nextMonth = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
    if (nextMonth >= firstCalendarMonth && nextMonth <= lastCalendarMonth) setCalendarMonth(nextMonth);
  };
  const calendarMonthLabel = istInstant(`${calendarMonth}-01`).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'long', year: 'numeric' });

  useEffect(() => {
    let active = true;
    getConsultationOptions().then(({ data }) => {
      if (!active) return;
      const firstService = data.services?.find((item) => item.mode === requestedMode) || data.services?.[0];
      if (!firstService || !data.doctor) { setOptionsError('Online requests are not available right now. Please call the clinic.'); return; }
      setOptions(data);
      setSelection({ serviceId: firstService.id, locationId: firstService.mode === 'in_person' ? data.locations?.[0]?.id || '' : '', dateKey: istDateKey() });
    }).catch(() => active && setOptionsError('Online requests are temporarily unavailable. Please call the clinic or try again shortly.'));
    return () => { active = false; };
  }, [requestedMode]);

  // Signed-in patients should not retype details already held in their profile.
  useEffect(() => {
    let active = true;
    authReady.then(async () => {
      const user = auth.currentUser;
      if (!user) return;
      const profile = await getDoc(doc(firestore, 'patients', user.uid)).catch(() => null);
      if (!active) return;
      setForm((current) => ({
        ...current,
        name: current.name || profile?.get('displayName') || user.displayName || '',
        phone: current.phone || profile?.get('phone') || '',
        email: current.email || user.email || '',
      }));
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setSelectedSlot(null);
    setMessage('');
    setSlots([]);
    setAvailabilityReady(false);
    if (!selection.serviceId || (inPerson && !selection.locationId) || !options?.doctor?.id) { setSlots([]); return undefined; }
    setLoadingSlots(true);
    getConsultationAvailability({
      doctorId: options.doctor.id,
      serviceId: selection.serviceId,
      locationId: inPerson ? selection.locationId : null,
      dateKey: selection.dateKey,
    })
      .then(({ data }) => { if (active) { setSlots(data.slots || []); setAvailabilityReady(true); } })
      .catch((error) => active && setMessage(friendlyError(error)))
      .finally(() => active && setLoadingSlots(false));
    return () => { active = false; };
  }, [inPerson, selection.serviceId, selection.locationId, selection.dateKey, options?.doctor?.id]);

  const submit = async (event) => {
    event.preventDefault();
    if (!selectedSlot) return setMessage('Select an available consultation time.');
    if (!form.consent) return setMessage('Please provide consent before sending your request.');
    // Guests may give either channel; the server enforces the same rule.
    if (!form.phone.trim() && !form.email.trim()) return setMessage('Enter a phone number or email address so the clinic can confirm your request.');
    setSaving(true);
    setMessage('');
    setResult(null);
    try {
      await authReady;
      const { data } = await submitConsultationRequest({
        mode: service.mode,
        serviceId: selection.serviceId,
        doctorId: options.doctor.id,
        locationId: inPerson ? selection.locationId : null,
        dateKey: selection.dateKey,
        time: selectedSlot.time,
        patient: { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), consentToTreatment: true },
        reason: form.reason.trim(),
        consentVersion: 'consultation-request-v1',
        clientRequestId: requestId(),
      });
      setResult({ reference: data.reference, status: data.status, mode: service.mode, link: data.accessToken ? consultationStatusLink({ reference: data.reference, token: data.accessToken }) : '' });
      setForm({ name: '', phone: '', email: '', reason: '', consent: false });
      setSelectedSlot(null);
      setStep('result');
      // The selected slot is confirmed and removed from availability by the server.
    } catch (error) {
      setMessage(friendlyError(error));
      if (errorCode(error) === 'already-exists') setSlots((current) => current.filter((slot) => slot.slotId !== selectedSlot?.slotId));
      if (errorCode(error) === 'failed-precondition' || errorCode(error) === 'already-exists') setStep('service');
    } finally {
      setSaving(false);
    }
  };

  const chooseService = (serviceId) => {
    const next = options.services.find((item) => item.id === serviceId);
    setSelectedSlot(null);
    setResult(null);
    setSelection({ ...selection, serviceId, locationId: next?.mode === 'in_person' ? options.locations?.[0]?.id || '' : '' });
  };

  const resultTitles = { confirmed: 'Appointment confirmed.', pending: 'Request submitted.', proposal_pending: 'A time has been proposed.', declined: 'Request declined.', cancelled: 'Request cancelled.', expired: 'Request expired.' };
  const notice = result && <div className="booking-message" role="status"><strong>{result.status === 'confirmed' && result.mode === 'video' ? 'Online consultation confirmed.' : resultTitles[result.status] || 'Request received.'}</strong><span>Reference: {result.reference}. {result.status === 'confirmed' ? 'The selected time is reserved for you.' : result.status === 'pending' ? 'The clinic will review your request.' : 'Check your request status for the next step.'}{result.link && <> <Link to={result.link}>View or cancel this appointment</Link>.</>}</span></div>;


  const scheduleMarkup = <div className="booking-scheduler">
    <aside className="booking-calendar" aria-label="Choose an appointment date">
      <div className="booking-calendar__header"><button type="button" aria-label="Previous month" disabled={calendarMonth <= firstCalendarMonth} onClick={() => shiftCalendarMonth(-1)}>‹</button><strong>{calendarMonthLabel}</strong><button type="button" aria-label="Next month" disabled={calendarMonth >= lastCalendarMonth} onClick={() => shiftCalendarMonth(1)}>›</button></div>
      <div className="booking-calendar__weekdays">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className="booking-calendar__grid">{calendarCells.map((dateKey, index) => { const enabled = dateKey && days.includes(dateKey); return dateKey ? <button key={dateKey} type="button" disabled={!enabled} aria-label={labelDate(dateKey)} aria-pressed={dateKey === selection.dateKey} onClick={() => setSelection({ ...selection, dateKey })} className={dateKey === selection.dateKey ? 'booking-calendar__day booking-calendar__day--selected' : 'booking-calendar__day'}><span>{Number(dateKey.slice(-2))}</span></button> : <span key={`blank-${index}`} />; })}</div>
      <p className="booking-timezone">Times shown in Indian Standard Time (IST).</p>
    </aside>
    <div className="slot-picker"><label>Times for {labelDate(selection.dateKey)}</label>{loadingSlots ? <p className="slot-empty" role="status">Loading available times…</p> : availabilityReady && slotGroups.length ? <><p className="booking-slot-key">Faded times are unavailable.</p><div className="booking-session-list">{slotGroups.map(([name, group]) => <section className="booking-session" key={name}><div><strong>{name}</strong><span>{group.filter(slot => !slot.unavailable).length} available · {service?.minutes} minutes</span></div><div className="slot-grid">{group.map((slot) => <button key={slot.slotId || slot.time} type="button" disabled={slot.unavailable} aria-label={`${slot.time}${slot.unavailable ? ' unavailable' : ''}`} aria-pressed={!slot.unavailable && selectedSlot?.slotId === slot.slotId} onClick={() => setSelectedSlot(slot)} className={`slot-option ${selectedSlot?.slotId && selectedSlot.slotId === slot.slotId ? 'slot-option--selected' : ''}`}>{slot.time}</button>)}</div></section>)}</div></> : availabilityReady ? <p className="slot-empty">No consultation times are configured for this selection.</p> : null}</div>
  </div>;

  const stages = ['service', 'details'];
  const activeStage = step === 'review' ? 'details' : step;
  const stageIndex = stages.indexOf(activeStage);
  const go = (next) => { setMessage(''); setStep(next); };
  const reviewDetails = (event) => {
    event.preventDefault();
    if (!form.phone.trim() && !form.email.trim()) { setMessage('Enter a phone number or email address.'); return; }
    const phone = form.phone.trim();
    if (phone && (!/^\+?[0-9][0-9\s-]{6,18}$/.test(phone) || !parsePhoneNumberFromString(phone, 'IN')?.isValid())) { setMessage('Phone number is invalid.'); return; }
    if (!form.consent) { setMessage('Please provide consent before continuing.'); return; }
    go('review');
  };

  return <><Navbar /><main className="booking-page booking-journey">
    <header className="booking-journey__intro"><p>SOOD CLINIC · PANCHKULA</p><h1>Book your consultation</h1><span>Choose the care you need and a time that suits you.</span></header>
    <section className="booking-journey__shell">
      {optionsError ? <p role="alert">{optionsError}</p> : !options ? <p role="status">Loading consultation options…</p> : <>
        {step !== 'result' && <nav aria-label="Booking progress" className="booking-journey__progress">{['Choose a time', 'Your details'].map((label, i) => <div key={label} aria-current={stageIndex === i ? 'step' : undefined} className={stageIndex >= i ? 'is-active' : ''}><span>{i + 1}</span><strong>{label}</strong></div>)}</nav>}
        {notice && step === 'result' && <div className="booking-journey__result">{notice}<button type="button" onClick={() => { setResult(null); go('service'); }}>Book another consultation</button></div>}
        {step === 'service' && <div className="booking-journey__stage booking-journey__scheduler"><p className="booking-journey__eyebrow">STEP 1 OF 2</p><h2>Choose your consultation</h2><p>Select a consultation type, location and available time.</p><div className="booking-journey__switch" role="group" aria-label="Consultation type">{options.services.map(item => <button type="button" key={item.id} aria-pressed={selection.serviceId === item.id} onClick={() => chooseService(item.id)}>{item.mode === 'video' ? 'Online video' : item.label}</button>)}</div>{inPerson && <div className="booking-journey__location"><h3>Choose a location</h3><div className="booking-journey__switch booking-journey__switch--locations" role="group" aria-label="Clinic location">{options.locations.map(item => <button type="button" key={item.id} aria-pressed={selection.locationId === item.id} onClick={() => { setSelectedSlot(null); setSelection({ ...selection, locationId: item.id }); }}>{item.name}</button>)}</div>{location && <p>{location.address}{location.landmark ? ` · ${location.landmark}` : ''}</p>}</div>}{!inPerson && <p className="booking-journey__online-note">Online video consultation with {options.doctor.name}.</p>}{scheduleMarkup}{message && <p className="booking-message" role="alert">{message}</p>}<div className="booking-journey__actions booking-journey__actions--end"><button type="button" disabled={!selectedSlot || loadingSlots || (inPerson && !location)} onClick={() => go('details')}>Continue →</button></div></div>}
        {step === 'details' && <form className="booking-journey__stage booking-form" onSubmit={reviewDetails}><div className="booking-form__full"><p className="booking-journey__eyebrow">STEP 2 OF 2</p><h2>Tell us about yourself</h2><p>We use your contact details to manage your consultation.</p></div><div><label htmlFor="patient-name">Full name *</label><input id="patient-name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoComplete="name" /></div><div><label htmlFor="patient-phone">Phone number</label><input id="patient-phone" type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} autoComplete="tel" /></div><div><label htmlFor="patient-email">Email address</label><input id="patient-email" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="email" /><small className="booking-field-hint">Provide a phone number or an email address.</small></div><div className="booking-form__full"><label htmlFor="reason">Reason for visit (optional)</label><input id="reason" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div><label className="booking-consent"><input type="checkbox" checked={form.consent} onChange={e => setForm({ ...form, consent: e.target.checked })} /> <span>I consent to Sood Clinic recording these details to arrange this appointment.</span></label>{message && <p className="booking-message" role="alert">{message}</p>}<div className="booking-journey__actions booking-form__full"><button className="booking-journey__back" type="button" onClick={() => go('service')}>Back</button><button type="submit">Review details →</button></div></form>}
        {step === 'review' && <form className="booking-journey__stage" onSubmit={submit}><p className="booking-journey__eyebrow">REVIEW YOUR BOOKING</p><h2>Check your details</h2><p>Your time is reserved only after the clinic confirms your booking.</p><dl className="booking-journey__summary"><div><dt>Consultation</dt><dd>{service?.label} · {service?.minutes} min</dd></div><div><dt>Doctor</dt><dd>{options.doctor.name}</dd></div><div><dt>Location</dt><dd>{inPerson ? location?.name : 'Online video consultation'}</dd></div><div><dt>Date and time</dt><dd>{labelDate(selection.dateKey)} · {selectedSlot?.time} IST</dd></div><div><dt>Patient</dt><dd>{form.name}</dd></div><div><dt>Contact</dt><dd>{[form.phone, form.email].filter(Boolean).join(' · ')}</dd></div></dl>{message && <p className="booking-message" role="alert">{message}</p>}<div className="booking-journey__actions"><button className="booking-journey__back" type="button" onClick={() => go('details')}>Edit details</button><button type="submit" disabled={saving}>{saving ? 'Submitting…' : 'Submit booking'}</button></div></form>}
      </>}
    </section>
  </main><Footer /></>;
};

export default Bookappointment;
