import { useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { auth, authReady, firestore, functions } from '../lib/firebase';
import { addIstDays, istDateKey, istInstant } from '../lib/ist';
import { getBookingCatalog } from '../services/bookingCatalogService';

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
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState('');
  const [selection, setSelection] = useState({ branchId: '', departmentId: '', doctorId: '', visitTypeId: 'consultation' });
  const days = useMemo(() => {
    const today = istDateKey();
    return Array.from({ length: catalog?.booking?.bookingWindowDays || 14 }, (_, index) => istInstant(addIstDays(today, index)));
  }, [catalog]);
  const [selectedDate, setSelectedDate] = useState(days[0]);
  const [slots, setSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [calendarStatus, setCalendarStatus] = useState('');
  const [message, setMessage] = useState('');
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState('schedule');
  const [form, setForm] = useState({ name: '', phone: '', reason: '', consent: false });

  const departments = useMemo(() => (catalog?.departments || []).filter((item) => item.branchId === selection.branchId), [catalog, selection.branchId]);
  const doctors = useMemo(() => (catalog?.doctors || []).filter((item) => item.branchId === selection.branchId && item.departmentIds.includes(selection.departmentId)), [catalog, selection]);
  const visitTypes = catalog?.booking?.visitTypes || [];
  const selectedDoctor = doctors.find((item) => item.id === selection.doctorId);
  const selectedVisitType = visitTypes.find((item) => item.id === selection.visitTypeId);

  useEffect(() => {
    let active = true;
    getBookingCatalog().then((data) => {
      if (!active) return;
      const branch = data.branches?.[0]; const department = data.departments?.find((item) => item.branchId === branch?.id); const doctor = data.doctors?.find((item) => item.branchId === branch?.id && item.departmentIds.includes(department?.id));
      if (!branch || !department || !doctor) { setCatalogError('Online booking is not available right now. Please call the clinic.'); return; }
      setCatalog(data); setSelection({ branchId: branch.id, departmentId: department.id, doctorId: doctor.id, visitTypeId: data.booking?.visitTypes?.[0]?.id || 'consultation' });
    }).catch(() => active && setCatalogError('Online booking is temporarily unavailable. Please call the clinic or try again shortly.'));
    return () => { active = false; };
  }, []);

  // Booking remains available to visitors, but an authenticated patient should
  // never need to retype details already kept in their private clinic profile.
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
      }));
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setSelectedSlot(null);
    setMessage('');
    setLoadingSlots(true);
    if (!selection.doctorId) return undefined;
    getAvailability({ doctorId: selection.doctorId, dateKey: istDateKey(selectedDate), visitTypeId: selection.visitTypeId })
      .then(({ data }) => {
        if (!active) return;
        setSlots(data.slots || []);
        setCalendarStatus(data.calendar?.status === 'degraded' ? 'The clinic calendar is updating; times shown are based on the clinic schedule.' : '');
      })
      .catch((error) => active && setMessage(friendlyError(error)))
      .finally(() => active && setLoadingSlots(false));
    return () => { active = false; };
  }, [selectedDate, selection.doctorId, selection.visitTypeId]);

  const submit = async (event) => {
    event.preventDefault();
    if (!selectedSlot) return setMessage('Select an available consultation time.');
    if (!form.consent) return setMessage('Please provide consent before booking.');
    setSaving(true);
    setMessage('');
    try {
      await authReady;
      const { data } = await createBooking({
        branchId: selection.branchId,
        departmentId: selection.departmentId,
        doctorId: selection.doctorId,
        dateKey: istDateKey(selectedDate),
        time: selectedSlot.time,
        visitTypeId: selection.visitTypeId,
        patient: { name: form.name.trim(), phone: form.phone.trim(), consentToTreatment: true },
        reason: form.reason.trim(),
        consentVersion: 'booking-v1',
        clientRequestId: requestId(),
      });
      setMessage(`${selectedVisitType?.mode === 'video' ? 'Your online consultation' : 'Your consultation'} is reserved for ${labelDate(selectedDate)} at ${selectedSlot.time}. Reference: ${data.reference}${selectedVisitType?.mode === 'video' ? ' The clinic will add your secure joining details before the appointment.' : ''}`);
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

  const chooseBranch = (branchId) => { const nextDepartment = (catalog.departments || []).find((item) => item.branchId === branchId); const nextDoctor = (catalog.doctors || []).find((item) => item.branchId === branchId && item.departmentIds.includes(nextDepartment?.id)); setSelection({ ...selection, branchId, departmentId: nextDepartment?.id || '', doctorId: nextDoctor?.id || '' }); };
  const chooseDepartment = (departmentId) => { const nextDoctor = doctors.find((doctor) => doctor.departmentIds.includes(departmentId)); setSelection({ ...selection, departmentId, doctorId: nextDoctor?.id || '' }); };
  return <><Navbar /><main className="booking-page"><section className="booking-page__intro"><p>SOOD CLINIC · PANCHKULA</p><h1>Book your consultation</h1><span>Choose your service, then select an available appointment time.</span></section><section className="booking-card appointment-booking">{catalogError ? <p className="booking-message" role="alert">{catalogError}</p> : !catalog ? <p className="slot-empty">Loading clinic availability…</p> : <><div className="booking-doctor"><span>{departments.find((item) => item.id === selection.departmentId)?.name || 'Consultation'}</span><strong>{selectedDoctor?.name || 'Clinic specialist'}</strong><small>{step === 'schedule' ? '1 of 2 · Select a date and time' : '2 of 2 · Confirm your details'}</small></div><form onSubmit={submit} className="booking-form">{step === 'schedule' && <>{catalog.branches?.length > 1 && <div className="booking-form__full"><label>Clinic location<select value={selection.branchId} onChange={(event) => chooseBranch(event.target.value)}>{catalog.branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label></div>}<div className="booking-form__full"><label>Service<select value={selection.departmentId} onChange={(event) => chooseDepartment(event.target.value)}>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label></div><div className="booking-form__full"><label>Specialist<select value={selection.doctorId} onChange={(event) => { const doctor = doctors.find((item) => item.id === event.target.value); setSelection({ ...selection, doctorId: event.target.value, departmentId: doctor?.departmentIds.includes(selection.departmentId) ? selection.departmentId : doctor?.departmentIds[0] || '' }); }}><option value="">Choose a specialist</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></label></div><div className="booking-form__full"><label>Visit type<select value={selection.visitTypeId} onChange={(event) => setSelection({ ...selection, visitTypeId: event.target.value })}>{visitTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label></div><div className="booking-calendar"><label>Choose a day</label><div className="day-picker">{days.map((date) => <button key={istDateKey(date)} type="button" onClick={() => setSelectedDate(date)} className={`day-option ${istDateKey(date) === istDateKey(selectedDate) ? 'day-option--selected' : ''}`}><span>{date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short' })}</span><strong>{date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric' })}</strong><small>{date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', month: 'short' })}</small></button>)}</div></div><div className="slot-picker"><label>Available times for {labelDate(selectedDate)}</label>{loadingSlots ? <p className="slot-empty">Loading available times…</p> : slots.length ? <div className="slot-grid">{slots.map((slot) => <button key={slot.slotId} type="button" onClick={() => setSelectedSlot(slot)} className={`slot-option ${selectedSlot?.slotId === slot.slotId ? 'slot-option--selected' : ''}`}>{slot.time}</button>)}</div> : <p className="slot-empty">No consultations are available on this day.</p>}</div>{calendarStatus && <p className="booking-message" role="status">{calendarStatus}</p>}<div className="text-center"><button type="button" disabled={!selectedSlot || loadingSlots} onClick={() => setStep('details')}>Continue</button></div></>}{step === 'details' && <><div className="booking-selection"><strong>{labelDate(selectedDate)} · {selectedSlot?.time}</strong><button type="button" onClick={() => setStep('schedule')}>Change</button></div><div><label htmlFor="patient-name">Full name</label><input id="patient-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Enter full name" /></div><div><label htmlFor="patient-phone">Phone number</label><input id="patient-phone" type="tel" required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Enter phone number" /></div><div className="booking-form__full"><label htmlFor="reason">Reason for visit <em>Optional</em></label><input id="reason" value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="A brief note helps the clinic prepare" /></div><label className="booking-consent"><input type="checkbox" checked={form.consent} onChange={(event) => setForm({ ...form, consent: event.target.checked })} /> <span>I consent to Sood Clinic recording these details to arrange this appointment.</span></label><div className="text-center"><button disabled={saving} type="submit">{saving ? 'Reserving your slot…' : 'Confirm appointment'}</button></div></>}{message && <p className="booking-message" role="status">{message}</p>}</form></>}</section></main><Footer /></>;
};

export default Bookappointment;
