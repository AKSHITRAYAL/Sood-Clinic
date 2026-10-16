import { useEffect, useState } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import ConfirmDialog from '../../components/ConfirmDialog';
import Footer from '../../components/Footer';
import { cancelBookingByToken, getAvailability, getBookingByToken, rescheduleBookingByToken } from '../../services/schedulerService';
import { friendlyBookingError } from '../../lib/bookingErrors';
import { downloadIcs } from './ics';

const ConfirmationPage = () => {
  const { reference } = useParams();
  const location = useLocation();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [booking, setBooking] = useState(location.state?.booking || null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newSlots, setNewSlots] = useState([]);

  useEffect(() => {
    if (booking || !token) return undefined;
    let active = true;
    getBookingByToken({ reference, token })
      .then((result) => active && setBooking(result))
      .catch((caught) => active && setError(friendlyBookingError(caught)));
    return () => { active = false; };
  }, [booking, reference, token]);

  const cancel = async (reason) => {
    if (!token) return;
    setConfirmCancel(false);
    setCancelling(true);
    setError('');
    try {
      await cancelBookingByToken({ reference, token, reason: reason || 'Cancelled online by patient' });
      setBooking((current) => ({ ...current, status: 'cancelled' }));
    } catch (caught) {
      setError(friendlyBookingError(caught));
    } finally {
      setCancelling(false);
    }
  };

  useEffect(() => {
    if (!rescheduling || !booking?.doctorId || !booking?.visitType) return undefined;
    let active = true;
    getAvailability({ doctorId: booking.doctorId, dateKey: newDate, visitTypeId: booking.visitType })
      .then((result) => active && setNewSlots(result.slots || result.availableSlots || []))
      .catch(() => active && setNewSlots([]));
    return () => { active = false; };
  }, [booking, newDate, rescheduling]);

  const reschedule = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const result = await rescheduleBookingByToken({ reference, token, dateKey: newDate, time: newTime });
      setBooking((current) => ({ ...current, dateKey: result.dateKey, time: result.time, startsAt: null }));
      setRescheduling(false);
    } catch (caught) {
      setError(friendlyBookingError(caught));
    }
  };

  const isCancelled = booking?.status === 'cancelled';
  return <><Navbar /><main className="booking-page"><section className="booking-success">
    {booking ? <><span className="booking-success__check">{isCancelled ? '!' : '✓'}</span>
      <p className="section-kicker">{isCancelled ? 'Appointment cancelled' : 'Appointment details'}</p>
      <h1>{isCancelled ? 'Your appointment is cancelled' : 'You’re booked'}</h1>
      <p>{booking.visitType || 'Your appointment'} {isCancelled ? 'has been cancelled.' : 'is reserved.'}</p>
      <div className="booking-success__details">
        <strong>{booking.dateKey} · {booking.startsAt ? new Date(booking.startsAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }) : booking.time || ''}</strong>
        <span>Reference <b>{booking.reference || reference}</b></span>
      </div>
      {!isCancelled && booking.startsAt && <button type="button" onClick={() => downloadIcs({ reference: booking.reference || reference, title: booking.visitType || 'Sood Clinic appointment', startsAt: booking.startsAt, endsAt: booking.endsAt })}>Add to calendar</button>}
      {!isCancelled && token && <button type="button" onClick={() => { setRescheduling((current) => !current); setNewDate(booking.dateKey); }}> {rescheduling ? 'Close rescheduling' : 'Reschedule appointment'} </button>}
      {!isCancelled && token && <button type="button" onClick={() => setConfirmCancel(true)} disabled={cancelling}>{cancelling ? 'Cancelling…' : 'Cancel appointment'}</button>}
      <ConfirmDialog open={confirmCancel} title="Cancel this appointment?" message="Cancel this appointment? You can book again at any time." confirmLabel="Cancel appointment" requireReason onCancel={() => setConfirmCancel(false)} onConfirm={cancel} />
      <a className="scheduler-next" href={`https://wa.me/?text=${encodeURIComponent(`My Sood Clinic appointment reference is ${booking.reference || reference}`)}`}>Share on WhatsApp</a>
      {rescheduling && <form className="scheduler-details" onSubmit={reschedule}><label>New date<input required type="date" value={newDate} min={new Date().toISOString().slice(0, 10)} onChange={(event) => { setNewDate(event.target.value); setNewTime(''); }} /></label><label>New time<select required value={newTime} onChange={(event) => setNewTime(event.target.value)}><option value="">Choose a time</option>{newSlots.map((slot) => <option key={slot.time} value={slot.time}>{slot.time}</option>)}</select></label><button type="submit">Confirm new time</button></form>}
    </> : <><p className="section-kicker">Booking lookup</p><h1>{error || 'Open your secure booking link'}</h1><p>Use the secure link from your confirmation message to view or manage this appointment.</p><Link className="scheduler-next" to="/book">Book an appointment</Link></>}
    {error && booking && <p className="booking-message" role="alert">{error}</p>}
  </section></main><Footer /></>;
};

export default ConfirmationPage;
