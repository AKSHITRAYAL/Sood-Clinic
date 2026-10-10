import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Link, Navigate, useParams } from 'react-router-dom';
import { auth, firestore, functions } from '../lib/firebase';
import { addIstDays, istDateKey, istInstant } from '../lib/ist';
import { toDate } from '../lib/time';
import { reschedulePatientAppointment } from '../services/appointmentService';

const getAvailability = httpsCallable(functions, 'getAvailability');
const labelDate = (date) => date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });
const friendlyError = (error) => error?.message || 'We could not update this appointment. Please try again.';

const RescheduleAppointment = () => {
  const { appointmentId } = useParams();
  const [user, setUser] = useState(undefined);
  const [appointment, setAppointment] = useState(undefined);
  const [selectedDate, setSelectedDate] = useState(istInstant(istDateKey()));
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const days = useMemo(() => Array.from({ length: 14 }, (_, index) => istInstant(addIstDays(istDateKey(), index))), []);

  useEffect(() => onAuthStateChanged(auth, (next) => setUser(next || null)), []);
  useEffect(() => {
    if (!user || !appointmentId) return undefined;
    let active = true;
    getDoc(doc(firestore, 'appointments', appointmentId)).then((snapshot) => {
      if (!active) return;
      if (!snapshot.exists() || snapshot.data().patientId !== user.uid) { setAppointment(null); return; }
      setAppointment({ id: snapshot.id, ...snapshot.data() });
    }).catch(() => active && setAppointment(null));
    return () => { active = false; };
  }, [user, appointmentId]);
  useEffect(() => {
    if (!appointment?.doctorId || !appointment?.visitType) return undefined;
    let active = true;
    setSelectedSlot(null); setSlots([]); setError(''); setLoadingSlots(true);
    getAvailability({ doctorId: appointment.doctorId, dateKey: istDateKey(selectedDate), visitTypeId: appointment.visitType })
      .then(({ data }) => active && setSlots(data.slots || []))
      .catch((caught) => active && setError(friendlyError(caught)))
      .finally(() => active && setLoadingSlots(false));
    return () => { active = false; };
  }, [appointment, selectedDate]);

  const submit = async () => {
    if (!selectedSlot) { setError('Choose a new available time.'); return; }
    setSaving(true); setError(''); setMessage('');
    try {
      await reschedulePatientAppointment(appointment.id, istDateKey(selectedDate), selectedSlot.time);
      setMessage('Your appointment has been rescheduled.');
      setAppointment((current) => ({ ...current, startsAt: selectedSlot.startsAt, endsAt: selectedSlot.endsAt, dateKey: istDateKey(selectedDate) }));
      setSelectedSlot(null);
    } catch (caught) { setError(friendlyError(caught)); }
    finally { setSaving(false); }
  };

  if (user === undefined || appointment === undefined) return <main className="booking-page"><p className="slot-empty">Loading appointment details…</p></main>;
  if (!user) return <Navigate to="/login" replace />;
  if (!appointment) return <main className="booking-page"><section className="booking-card"><p className="booking-message" role="alert">This appointment is unavailable.</p><Link to="/patient/appointments">Return to appointments</Link></section></main>;
  const currentDate = toDate(appointment.startsAt);
  return <main className="booking-page"><section className="booking-page__intro"><p>YOUR APPOINTMENT</p><h1>Choose a new time</h1><span>Your existing visit stays confirmed until you select and save another available time.</span></section><section className="booking-card appointment-booking appointment-reschedule"><div className="booking-doctor"><span>Current appointment</span><strong>{currentDate ? `${labelDate(currentDate)} · ${currentDate.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })}` : 'Time unavailable'}</strong><small>Choose another available time below.</small></div><div className="booking-calendar"><label>Choose a day</label><div className="day-picker">{days.map((date) => <button key={istDateKey(date)} type="button" onClick={() => setSelectedDate(date)} className={`day-option ${istDateKey(date) === istDateKey(selectedDate) ? 'day-option--selected' : ''}`}><span>{date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short' })}</span><strong>{date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric' })}</strong><small>{date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short' })}</small></button>)}</div></div><div className="slot-picker"><label>Available times for {labelDate(selectedDate)}</label>{loadingSlots ? <p className="slot-empty">Loading available times…</p> : slots.length ? <div className="slot-grid">{slots.map((slot) => <button key={slot.slotId} type="button" onClick={() => setSelectedSlot(slot)} className={`slot-option ${selectedSlot?.slotId === slot.slotId ? 'slot-option--selected' : ''}`}>{slot.time}</button>)}</div> : <p className="slot-empty">No consultations are available on this day.</p>}</div>{error && <p className="booking-message" role="alert">{error}</p>}{message && <p className="booking-message" role="status">{message} <Link to="/patient/appointments">View appointments</Link></p>}<div className="appointment-reschedule__actions"><Link to="/patient/appointments">Keep current appointment</Link><button type="button" onClick={submit} disabled={!selectedSlot || saving}>{saving ? 'Updating…' : 'Save new time'}</button></div></section></main>;
};

export default RescheduleAppointment;
