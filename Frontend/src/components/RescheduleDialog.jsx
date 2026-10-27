import { useEffect, useId, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { rescheduleStaffAppointment } from '../services/appointmentService';
import { istDateKey } from '../lib/ist';

// Staff rescheduling keeps the same appointment reference. The server owns slot
// availability, so this form only collects a date and an IST time; a time the
// clinic cannot offer comes back as an explained error, never a silent no-op.
const RescheduleDialog = ({ open, appointment, onClose, onDone }) => {
  const [dateKey, setDateKey] = useState(() => istDateKey());
  const [time, setTime] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const firstField = useRef(null);
  const dialogRef = useRef(null);
  const requestRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    setDateKey(appointment?.dateKey || istDateKey());
    setTime('');
    setMessage('');
    setBusy(false);
    const focusTimer = window.setTimeout(() => firstField.current?.focus(), 0);
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!requestRef.current) closeRef.current?.();
      }
      if (event.key !== 'Tab') return;
      const items = [...(dialogRef.current?.querySelectorAll('input:not([disabled]), button:not([disabled])') || [])];
      const first = items[0]; const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { requestRef.current = null; window.clearTimeout(focusTimer); window.removeEventListener('keydown', onKeyDown); opener?.focus?.(); };
  }, [open, appointment?.id, appointment?.dateKey]);

  if (!open) return null;

  const submit = async (event) => {
    event.preventDefault();
    if (requestRef.current) return;
    if (!appointment?.id) { setMessage('Choose an appointment before rescheduling.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) { setMessage('Choose a valid clinic date.'); return; }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) { setMessage('Enter the new time as HH:mm in IST.'); return; }
    const request = {};
    requestRef.current = request;
    setBusy(true);
    setMessage('');
    try {
      const { data } = await rescheduleStaffAppointment(appointment.id, dateKey, time);
      if (requestRef.current !== request) return;
      onDone?.(`Appointment moved to ${data?.dateKey || dateKey} at ${data?.time || time}. The patient keeps the same reference.`);
    } catch (error) {
      if (requestRef.current !== request) return;
      setMessage(error?.message || 'This appointment could not be rescheduled. Check the time and try again.');
    } finally {
      if (requestRef.current === request) { requestRef.current = null; setBusy(false); }
    }
  };

  return (
    <div className="confirm-dialog__backdrop" role="presentation" onMouseDown={() => { if (!requestRef.current) closeRef.current?.(); }}>
      <section ref={dialogRef} className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onMouseDown={(event) => event.stopPropagation()}>
        <h2 id={titleId}>Reschedule appointment</h2>
        <p>Choose a free clinic time. The patient keeps the same reference number and does not retype their details.</p>
        <form onSubmit={submit} noValidate>
          <label>New clinic date<input ref={firstField} type="date" value={dateKey} min={istDateKey()} onChange={(event) => setDateKey(event.target.value)} /></label>
          <label>New time (IST)<input type="time" value={time} onChange={(event) => setTime(event.target.value)} required /></label>
          {message && <small role="alert">{message}</small>}
          <div className="confirm-dialog__actions">
            <button type="button" className="staff-secondary-button" onClick={() => closeRef.current?.()} disabled={busy}>Keep current time</button>
            <button type="submit" disabled={busy}>{busy ? 'Moving appointment…' : 'Reschedule'}</button>
          </div>
        </form>
      </section>
    </div>
  );
};

RescheduleDialog.propTypes = {
  open: PropTypes.bool,
  appointment: PropTypes.shape({ id: PropTypes.string, dateKey: PropTypes.string }),
  onClose: PropTypes.func,
  onDone: PropTypes.func,
};

export default RescheduleDialog;
