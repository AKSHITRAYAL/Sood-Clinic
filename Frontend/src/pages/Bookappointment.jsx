import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { auth, firestore } from '../lib/firebase';
import { addIstDays, istDateKey, istInstant, weekdayIst } from '../lib/ist';
import { normalizeException, normalizeSchedule, sessionsForWeekday } from '../lib/schedule';

const DOCTOR_ID = 'brig-ak-sood';
const BRANCH_ID = 'sood-clinic';
const DEPARTMENT_ID = 'gastroenterology';
const HOURS = { 0: [], 1: [['08:00', '10:00'], ['17:00', '18:30']], 2: [['08:00', '10:00'], ['17:00', '18:30']], 3: [['08:00', '10:00'], ['17:00', '18:30']], 4: [['08:00', '10:00'], ['17:00', '18:30']], 5: [['08:00', '10:00'], ['17:00', '18:30']], 6: [['08:00', '10:00'], ['17:00', '18:30']] };
const pad = (value) => String(value).padStart(2, '0');
const dateKey = istDateKey;
const slotId = (date, time) => `${DOCTOR_ID}_${istDateKey(date)}_${time.replace(':', '-')}`;
const labelDate = (date) => date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });
const slotsFor = (date, override, weekly) => {
  const weekday = weekdayIst(istDateKey(date));
  const regular = weekly ? sessionsForWeekday(weekly, weekday) : (HOURS[weekday] || []).map(([start, end]) => ({ start, end }));
  const windows = override?.type === 'closed' ? [] : (override?.sessions || regular);
  return windows.flatMap(({ start, end }) => {
    const [sh, sm] = start.split(':').map(Number); const [eh, em] = end.split(':').map(Number); const slots = [];
    for (let value = sh * 60 + sm; value + 20 <= eh * 60 + em; value += 20) slots.push(`${pad(Math.floor(value / 60))}:${pad(value % 60)}`);
    return slots;
  });
};

const Bookappointment = () => {
  const days = useMemo(() => { const today = istDateKey(); return Array.from({ length: 14 }, (_, index) => istInstant(addIstDays(today, index))); }, []);
  const [selectedDate, setSelectedDate] = useState(days[0]); const [override, setOverride] = useState(null); const [weekly, setWeekly] = useState(null); const [booked, setBooked] = useState(new Set());
  const [selectedTime, setSelectedTime] = useState(''); const [message, setMessage] = useState(''); const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', reason: '', consent: false });
  const slots = slotsFor(selectedDate, override, weekly);

  useEffect(() => {
    let active = true; setSelectedTime(''); setMessage('');
    Promise.all([
      getDoc(doc(firestore, 'scheduleExceptions', `${DOCTOR_ID}_${istDateKey(selectedDate)}`)),
      getDoc(doc(firestore, 'doctorSchedules', DOCTOR_ID)),
      getDoc(doc(firestore, 'availabilityOverrides', `${DOCTOR_ID}_${istDateKey(selectedDate)}`)),
      getDoc(doc(firestore, 'clinicSchedules', DOCTOR_ID)),
    ]).then(([nextException, nextSchedule, legacyException, legacySchedule]) => {
      if (!active) return undefined;
      const next = normalizeException(nextException.exists() ? nextException.data() : (legacyException.exists() ? legacyException.data() : null));
      const rawSchedule = nextSchedule.exists() ? nextSchedule.data() : (legacySchedule.exists() ? legacySchedule.data() : null);
      const schedule = rawSchedule ? normalizeSchedule(rawSchedule) : null;
      setOverride(next); setWeekly(schedule);
      return Promise.all(slotsFor(selectedDate, next, schedule).map((time) => getDoc(doc(firestore, 'appointmentSlots', slotId(selectedDate, time)))));
    }).then((snapshots) => { if (active && snapshots) setBooked(new Set(snapshots.filter((item) => item.exists() && item.data().status === 'booked').map((item) => item.id))); }).catch(() => active && setMessage('Availability could not be loaded. Please refresh and try again.'));
    return () => { active = false; };
  }, [selectedDate]);

  const submit = async (event) => {
    event.preventDefault(); if (!selectedTime) return setMessage('Select an available consultation time.'); if (!form.consent) return setMessage('Please provide consent before booking.');
    const id = slotId(selectedDate, selectedTime); if (booked.has(id)) return setMessage('That time was just booked. Please choose another time.');
    setSaving(true); setMessage(''); const startsAt = istInstant(istDateKey(selectedDate), selectedTime); const endsAt = new Date(startsAt.getTime() + 20 * 60000);
    try {
      const batch = writeBatch(firestore); const appointment = doc(firestore, 'appointments', id); const slot = doc(firestore, 'appointmentSlots', id);
      batch.set(appointment, { slotId: id, branchId: BRANCH_ID, departmentId: DEPARTMENT_ID, doctorId: DOCTOR_ID, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), reason: form.reason.trim().slice(0, 500), status: 'scheduled', source: 'patient_portal', patientId: auth.currentUser?.uid || '', createdAt: serverTimestamp(), patient: { name: form.name.trim(), phone: form.phone.trim(), consentToTreatment: true } });
      batch.set(slot, { doctorId: DOCTOR_ID, appointmentId: id, startsAt: startsAt.toISOString(), status: 'booked', createdAt: serverTimestamp() }); await batch.commit();
      setBooked((current) => new Set([...current, id])); setMessage(`Your consultation is reserved for ${labelDate(selectedDate)} at ${selectedTime}. Reference: ${id.slice(-10).toUpperCase()}`); setForm({ name: '', phone: '', reason: '', consent: false }); setSelectedTime('');
    } catch { setBooked((current) => new Set([...current, id])); setMessage('This time is no longer available. Please choose another slot.'); } finally { setSaving(false); }
  };

  return <><Navbar /><main className="booking-page"><section className="booking-page__intro"><p>SOOD CLINIC · PANCHKULA</p><h1>Book your consultation</h1><span>Choose a day, then select an available 20-minute consultation with Dr. Brig. A. K. Sood VSM (Retd).</span></section><section className="booking-card appointment-booking"><div className="booking-doctor"><span>Gastroenterology</span><strong>Dr. Brig. A. K. Sood VSM (Retd)</strong><small>Regular hours: Monday–Saturday. Special Sunday or overtime slots appear when the doctor adds them.</small></div><form onSubmit={submit} className="booking-form"><div className="booking-calendar"><label>Choose a day</label><div className="day-picker">{days.map((date) => <button key={dateKey(date)} type="button" onClick={() => setSelectedDate(date)} className={`day-option ${dateKey(date) === dateKey(selectedDate) ? 'day-option--selected' : ''}`}><span>{date.toLocaleDateString('en-IN', { weekday: 'short' })}</span><strong>{date.getDate()}</strong><small>{date.toLocaleDateString('en-IN', { month: 'short' })}</small></button>)}</div></div><div className="slot-picker"><label>Available times for {labelDate(selectedDate)}</label>{slots.length ? <div className="slot-grid">{slots.map((time) => { const id = slotId(selectedDate, time); const unavailable = booked.has(id); return <button key={time} type="button" disabled={unavailable} onClick={() => setSelectedTime(time)} className={`slot-option ${selectedTime === time ? 'slot-option--selected' : ''}`}>{unavailable ? 'Booked' : time}</button>; })}</div> : <p className="slot-empty">No standard consultations on this day. The doctor may add special hours or an overtime clinic.</p>}</div><div><label htmlFor="patient-name">Full name</label><input id="patient-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Enter full name" /></div><div><label htmlFor="patient-phone">Phone number</label><input id="patient-phone" type="tel" required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Enter phone number" /></div><div className="booking-form__full"><label htmlFor="reason">Reason for visit <em>Optional</em></label><input id="reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="A brief note helps the clinic prepare" /></div><label className="booking-consent"><input type="checkbox" checked={form.consent} onChange={(event) => setForm({ ...form, consent: event.target.checked })} /> <span>I consent to Sood Clinic recording these details to arrange this appointment.</span></label>{message && <p className="booking-message" role="status">{message}</p>}<div className="text-center"><button disabled={saving || !slots.length} type="submit">{saving ? 'Reserving your slot…' : 'Reserve consultation'}</button></div></form></section></main><Footer /></>;
};
export default Bookappointment;
