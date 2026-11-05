import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
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
  const [options, setOptions] = useState(null);
  const [optionsError, setOptionsError] = useState('');
  const [selection, setSelection] = useState({ serviceId: '', locationId: '', dateKey: istDateKey() });
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState('schedule');
  const [result, setResult] = useState(null);
  const [form, setForm] = useState({ name: '', phone: '', email: '', reason: '', consent: false });
  const [calendarMonth, setCalendarMonth] = useState(istDateKey().slice(0, 7));

  const service = options?.services?.find((item) => item.id === selection.serviceId) || null;
  const inPerson = service?.mode === 'in_person';
  const location = options?.locations?.find((item) => item.id === selection.locationId) || null;
  const slotGroups = useMemo(() => {
    const groups = [];
    slots.forEach((slot) => {
      const minutes = Number(String(slot.time).slice(0, 2)) * 60 + Number(String(slot.time).slice(3, 5));
      const previous = groups.at(-1)?.items.at(-1);
      const previousMinutes = previous ? Number(String(previous.time).slice(0, 2)) * 60 + Number(String(previous.time).slice(3, 5)) : null;
      if (!groups.length || minutes - previousMinutes > 60) groups.push({ name: groups.length === 0 ? 'Morning' : 'Evening', items: [] });
      groups.at(-1).items.push(slot);
    });
    return groups.map(({ name, items }) => [name, items]);
  }, [slots]);
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
      const firstService = data.services?.find((item) => item.mode === 'in_person') || data.services?.[0];
      if (!firstService || !data.doctor) { setOptionsError('Online requests are not available right now. Please call the clinic.'); return; }
      setOptions(data);
      setSelection({ serviceId: firstService.id, locationId: firstService.mode === 'in_person' ? data.locations?.[0]?.id || '' : '', dateKey: istDateKey() });
    }).catch(() => active && setOptionsError('Online requests are temporarily unavailable. Please call the clinic or try again shortly.'));
    return () => { active = false; };
  }, []);

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
    if (!selection.serviceId || (inPerson && !selection.locationId) || !options?.doctor?.id) { setSlots([]); return undefined; }
    setLoadingSlots(true);
    getConsultationAvailability({
      doctorId: options.doctor.id,
      serviceId: selection.serviceId,
      locationId: inPerson ? selection.locationId : null,
      dateKey: selection.dateKey,
    })
      .then(({ data }) => { if (active) setSlots(data.slots || []); })
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
      setResult({ reference: data.reference, mode: service.mode, link: data.accessToken ? consultationStatusLink({ reference: data.reference, token: data.accessToken }) : '' });
      setForm({ name: '', phone: '', email: '', reason: '', consent: false });
      setSelectedSlot(null);
      setStep('schedule');
      // The selected slot is confirmed and removed from availability by the server.
    } catch (error) {
      setMessage(friendlyError(error));
      if (errorCode(error) === 'already-exists') setSlots((current) => current.filter((slot) => slot.slotId !== selectedSlot?.slotId));
      setStep('schedule');
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

  const notice = result && <div className="booking-message" role="status"><strong>{result.mode === 'video' ? 'Online consultation confirmed.' : 'Appointment confirmed.'}</strong><span>Your reference is {result.reference}. The selected time is reserved for you.{result.link && <> <Link to={result.link}>View or cancel this appointment</Link>.</>}</span></div>;

  const scheduleMarkup = <div className="booking-scheduler">
    <aside className="booking-calendar" aria-label="Choose an appointment date">
      <div className="booking-calendar__header"><button type="button" aria-label="Previous month" disabled={calendarMonth <= firstCalendarMonth} onClick={() => shiftCalendarMonth(-1)}>‹</button><strong>{calendarMonthLabel}</strong><button type="button" aria-label="Next month" disabled={calendarMonth >= lastCalendarMonth} onClick={() => shiftCalendarMonth(1)}>›</button></div>
      <div className="booking-calendar__weekdays">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className="booking-calendar__grid">{calendarCells.map((dateKey, index) => { const enabled = dateKey && days.includes(dateKey); return dateKey ? <button key={dateKey} type="button" disabled={!enabled} aria-label={labelDate(dateKey)} onClick={() => setSelection({ ...selection, dateKey })} className={dateKey === selection.dateKey ? 'booking-calendar__day booking-calendar__day--selected' : 'booking-calendar__day'}><span>{Number(dateKey.slice(-2))}</span>{enabled && <i aria-hidden="true" />}</button> : <span key={`blank-${index}`} />; })}</div>
      <p className="booking-timezone">Times shown in Indian Standard Time (IST).</p>
    </aside>
    <div className="slot-picker"><label>Available times for {labelDate(selection.dateKey)}</label>{loadingSlots ? <p className="slot-empty">Loading available times…</p> : slots.length ? <div className="booking-session-list">{slotGroups.map(([name, group]) => <section className="booking-session" key={name}><div><strong>{name}</strong><span>{group.length} available times · 15-minute slots</span></div><div className="slot-grid">{group.map((slot) => <button key={slot.slotId} type="button" onClick={() => setSelectedSlot(slot)} className={`slot-option ${selectedSlot?.slotId === slot.slotId ? 'slot-option--selected' : ''}`}>{slot.time}</button>)}</div></section>)}</div> : <p className="slot-empty">No consultations are available on this day. Choose another day or call the clinic.</p>}</div>
  </div>;

  return <><Navbar /><main className="booking-page"><section className="booking-page__intro"><p>SOOD CLINIC · PANCHKULA</p><h1>Book a consultation</h1><span>Choose a service and time. Available appointments are confirmed immediately.</span></section><section className="booking-card appointment-booking">{optionsError ? <p className="booking-message" role="alert">{optionsError}</p> : !options ? <p className="slot-empty">Loading consultation options…</p> : <><div className="booking-doctor"><span>{options.services.find((item) => item.id === selection.serviceId)?.label || 'Consultation'}</span><strong>{options.doctor.name}</strong><small>{step === 'schedule' ? '1 of 2 · Choose a service and time' : '2 of 2 · Your details'}</small></div>{notice}<form onSubmit={submit} className="booking-form">{step === 'schedule' && <><div className="booking-form__full"><label>Consultation type<select value={selection.serviceId} onChange={(event) => chooseService(event.target.value)}>{options.services.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label></div>{inPerson && <div className="booking-form__full"><label>Clinic location<select value={selection.locationId} onChange={(event) => { setSelectedSlot(null); setSelection({ ...selection, locationId: event.target.value }); }}>{options.locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{location && <small className="booking-field-hint">{location.address}{location.landmark ? ` · ${location.landmark}` : ''}</small>}</div>}{scheduleMarkup}<div className="text-center"><button type="button" disabled={!selectedSlot || loadingSlots} onClick={() => setStep('details')}>Continue</button></div></>}{step === 'details' && <><div className="booking-selection"><strong>{labelDate(selection.dateKey)} · {selectedSlot?.time}</strong><span>{inPerson ? location?.name : 'Online video consultation'}</span><button className="booking-selection__change" type="button" onClick={() => setStep('schedule')}>Change time</button></div><div><label htmlFor="patient-name">Full name</label><input id="patient-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Enter full name" /></div><div><label htmlFor="patient-phone">Phone number <em>Optional</em></label><input id="patient-phone" type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Enter phone number" /></div><div><label htmlFor="patient-email">Email address <em>Optional</em></label><input id="patient-email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@example.com" /><small className="booking-field-hint">Provide a phone number or an email address so the clinic can confirm your appointment.</small></div><div className="booking-form__full"><label htmlFor="reason">Reason for visit <em>Optional</em></label><input id="reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="A brief note helps the clinic prepare" /></div><label className="booking-consent"><input type="checkbox" checked={form.consent} onChange={(event) => setForm({ ...form, consent: event.target.checked })} /> <span>I consent to Sood Clinic recording these details to arrange this appointment.</span></label><div className="text-center"><button disabled={saving} type="submit">{saving ? 'Confirming your appointment…' : 'Confirm appointment'}</button></div><p className="booking-field-hint">Your appointment is confirmed after the slot is reserved. Keep the reference for changes or cancellation.</p></>}{message && <p className="booking-message" role="status">{message}</p>}</form></>}</section></main><Footer /></>;
};

export default Bookappointment;
