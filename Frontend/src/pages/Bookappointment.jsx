import { useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { authReady, functions } from '../lib/firebase';
import { addIstDays, istDateKey, istInstant } from '../lib/ist';

// The catalog selection stays narrow until P1-CONFIG exposes the multi-doctor
// clinic catalog. Availability and booking are never calculated or written here.
const DOCTOR_ID = 'brig-ak-sood';
const BRANCH_ID = 'sood-clinic';
const DEPARTMENT_ID = 'gastroenterology';
const getAvailability = httpsCallable(functions, 'getAvailability');
const createBooking = httpsCallable(functions, 'createBooking');

const labelDate = (date) => date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });
const requestId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
const friendlyError = (error) => {
  const code = String(error?.code || '').replace('functions/', '');
  if (code === 'already-exists') return 'That time has just been booked. Please choose another slot.';
  if (code === 'failed-precondition') return error.message || 'That time is no longer available. Please choose another slot.';
  if (code === 'unavailable') return 'Booking is temporarily unavailable. Please call the clinic or try again shortly.';
  return error?.message || 'We could not complete your booking. Please try again.';
};

const Bookappointment = () => {
  const days = useMemo(() => {
    const today = istDateKey();
    return Array.from({ length: 14 }, (_, index) => istInstant(addIstDays(today, index)));
  }, []);
  const [selectedDate, setSelectedDate] = useState(days[0]);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [calendarStatus, setCalendarStatus] = useState('');
  const [message, setMessage] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState('schedule');
  const [form, setForm] = useState({ name: '', phone: '', reason: '', consent: false });

  useEffect(() => {
    let active = true;
    setSelectedSlot(null);
    setMessage('');
    setLoadingSlots(true);
    getAvailability({ doctorId: DOCTOR_ID, dateKey: istDateKey(selectedDate), visitTypeId: 'consultation' })
      .then(({ data }) => {
        if (!active) return;
        setSlots(data.slots || []);
        setCalendarStatus(data.calendar?.status === 'degraded' ? 'The clinic calendar is updating; times shown are based on the clinic schedule.' : '');
      })
      .catch((error) => active && setMessage(friendlyError(error)))
      .finally(() => active && setLoadingSlots(false));
    return () => { active = false; };
  }, [selectedDate]);

  const submit = async (event) => {
    event.preventDefault();
    if (!selectedSlot) return setMessage('Select an available consultation time.');
    if (!form.consent) return setMessage('Please provide consent before booking.');
    setSaving(true);
    setMessage('');
    try {
      await authReady;
      const { data } = await createBooking({
        branchId: BRANCH_ID,
        departmentId: DEPARTMENT_ID,
        doctorId: DOCTOR_ID,
        dateKey: istDateKey(selectedDate),
        time: selectedSlot.time,
        visitTypeId: 'consultation',
        patient: { name: form.name.trim(), phone: form.phone.trim(), consentToTreatment: true },
        reason: form.reason.trim(),
        consentVersion: 'booking-v1',
        clientRequestId: requestId(),
      });
      setMessage(`Your consultation is reserved for ${labelDate(selectedDate)} at ${selectedSlot.time}. Reference: ${data.reference}`);
      setForm({ name: '', phone: '', reason: '', consent: false });
      setSelectedSlot(null);
      setStep('schedule');
      setSlots((current) => current.filter((slot) => slot.slotId !== selectedSlot.slotId));
    } catch (error) {
      setMessage(friendlyError(error));
      setStep('schedule');
    } finally {
      setSaving(false);
    }
  };

  return <><Navbar /><main className="booking-page"><section className="booking-page__intro"><p>SOOD CLINIC · PANCHKULA</p><h1>Book your consultation</h1><span>Choose a time first, then add your details to confirm the request.</span></section><section className="booking-card appointment-booking"><div className="booking-doctor"><span>Gastroenterology</span><strong>Dr. Brig. A. K. Sood VSM (Retd)</strong><small>{step === 'schedule' ? '1 of 2 · Select a date and time' : '2 of 2 · Confirm your details'}</small></div><form onSubmit={submit} className="booking-form">{step === 'schedule' && <><div className="booking-calendar"><label>Choose a day</label><div className="day-picker">{days.map((date) => <button key={istDateKey(date)} type="button" onClick={() => setSelectedDate(date)} className={`day-option ${istDateKey(date) === istDateKey(selectedDate) ? 'day-option--selected' : ''}`}><span>{date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short' })}</span><strong>{date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric' })}</strong><small>{date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short' })}</small></button>)}</div></div><div className="slot-picker"><label>Available times for {labelDate(selectedDate)}</label>{loadingSlots ? <p className="slot-empty">Loading available times…</p> : slots.length ? <div className="slot-grid">{slots.map((slot) => <button key={slot.slotId} type="button" onClick={() => setSelectedSlot(slot)} className={`slot-option ${selectedSlot?.slotId === slot.slotId ? 'slot-option--selected' : ''}`}>{slot.time}</button>)}</div> : <p className="slot-empty">No consultations are available on this day.</p>}</div>{calendarStatus && <p className="booking-message" role="status">{calendarStatus}</p>}<div className="text-center"><button type="button" disabled={!selectedSlot || loadingSlots} onClick={() => setStep('details')}>Continue</button></div></>}{step === 'details' && <><div className="booking-selection"><strong>{labelDate(selectedDate)} · {selectedSlot?.time}</strong><button type="button" onClick={() => setStep('schedule')}>Change</button></div><div><label htmlFor="patient-name">Full name</label><input id="patient-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Enter full name" /></div><div><label htmlFor="patient-phone">Phone number</label><input id="patient-phone" type="tel" required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Enter phone number" /></div><div className="booking-form__full"><label htmlFor="reason">Reason for visit <em>Optional</em></label><input id="reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="A brief note helps the clinic prepare" /></div><label className="booking-consent"><input type="checkbox" checked={form.consent} onChange={(event) => setForm({ ...form, consent: event.target.checked })} /> <span>I consent to Sood Clinic recording these details to arrange this appointment.</span></label><div className="text-center"><button disabled={saving} type="submit">{saving ? 'Reserving your slot…' : 'Confirm appointment'}</button></div></>}{message && <p className="booking-message" role="status">{message}</p>}</form></section></main><Footer /></>;
};

export default Bookappointment;
