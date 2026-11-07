import { useEffect, useMemo, useState } from 'react';
import StaffLayout from '../components/StaffLayout';
import { useStaffAccess } from '../lib/staffSessionContext';
import { istDateKey, toIstParts } from '../lib/ist';
import { patientName, patientPhone } from '../lib/time';
import { getAppointmentActions } from '../lib/appointmentActions';
import { canStaffRescheduleAppointment } from '../lib/appointmentState';
import { listStaffAppointments, transitionAppointment } from '../services/appointmentService';
import RescheduleDialog from '../components/RescheduleDialog';
import './staffAppointments.css';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (value) => String(value).padStart(2, '0');
const dateKey = (year, month, day) => `${year}-${pad(month + 1)}-${pad(day)}`;
const groups = [
  { id: 'morning', label: 'Morning', matches: (hour) => hour < 12 },
  { id: 'afternoon', label: 'Afternoon', matches: (hour) => hour >= 12 && hour < 17 },
  { id: 'evening', label: 'Evening', matches: (hour) => hour >= 17 },
];
const selectedDateLabel = (value) => new Date(`${value}T12:00:00+05:30`).toLocaleDateString('en-IN', {
  timeZone: 'Asia/Kolkata', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
const formatTime = (value) => new Date(value).toLocaleTimeString('en-IN', {
  timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit',
});

export default function StaffAppointments() {
  const { role, doctorId, state } = useStaffAccess();
  const today = useMemo(() => istDateKey(), []);
  const [selectedDate, setSelectedDate] = useState(today);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const { year, month } = toIstParts(new Date());
    return { year, month: month - 1 };
  });
  const [appointments, setAppointments] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [savingId, setSavingId] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [reschedule, setReschedule] = useState(null);

  const cells = useMemo(() => {
    const { year, month } = calendarMonth;
    const offset = new Date(year, month, 1).getDay();
    const dayCount = new Date(year, month + 1, 0).getDate();
    return [
      ...Array.from({ length: offset }, (_, index) => ({ key: `empty-${index}`, day: null })),
      ...Array.from({ length: dayCount }, (_, index) => ({ key: dateKey(year, month, index + 1), day: index + 1 })),
    ];
  }, [calendarMonth]);

  useEffect(() => {
    if (state !== 'allowed') return undefined;
    let active = true;
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      setLoading(true);
      setError('');
      try {
        const result = await listStaffAppointments(selectedDate, cursor);
        if (active) {
          setAppointments(result.appointments);
          setNextCursor(result.nextCursor);
        }
      } catch (caught) {
        if (active) {
          setAppointments([]);
          setNextCursor(null);
          setError(caught?.message || 'Appointments could not be loaded.');
        }
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    };
    load();
    const timer = window.setInterval(load, 30_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [state, selectedDate, cursor, revision]);

  const chooseDate = (value) => {
    setSelectedDate(value);
    setCursor(null);
  };
  const shiftMonth = (amount) => setCalendarMonth((current) => {
    const next = new Date(current.year, current.month + amount, 1);
    return { year: next.getFullYear(), month: next.getMonth() };
  });
  const groupedAppointments = groups.map((group) => ({
    ...group,
    appointments: appointments.filter((appointment) => {
      const hour = toIstParts(appointment.startsAt).hour;
      return group.matches(hour);
    }),
  })).filter((group) => group.appointments.length > 0);

  const applyAction = async (appointment, action) => {
    let reason = '';
    if (action.needsReason) {
      reason = window.prompt('Reason for cancellation');
      if (!reason?.trim()) return;
    }
    setSavingId(appointment.id);
    setActionError('');
    try {
      await transitionAppointment(appointment.id, action.to, reason.trim());
      setRevision((value) => value + 1);
    } catch (caught) {
      setActionError(caught?.message || 'The appointment could not be updated. Refresh and retry.');
    } finally {
      setSavingId('');
    }
  };

  return (
    <StaffLayout>
      <main className="staff-appointments">
        <header className="staff-appointments__heading">
          <div>
            <p className="staff-appointments__eyebrow">{role || 'Staff'} workspace</p>
            <h1>Appointments</h1>
            <p>Daily clinic queue · times shown in Indian Standard Time</p>
          </div>
          <div className="staff-appointments__actions">
            <button type="button" onClick={() => chooseDate(today)}>Today</button>
            <button type="button" disabled={loading} onClick={() => { setCursor(null); setRevision((value) => value + 1); }}>Refresh</button>
          </div>
        </header>

        <div className="staff-appointments__layout">
          <aside className="staff-appointments__calendar" aria-label="Choose appointment date">
            <div className="staff-appointments__month-head">
              <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}>‹</button>
              <strong>{MONTHS[calendarMonth.month]} {calendarMonth.year}</strong>
              <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}>›</button>
            </div>
            <div className="staff-appointments__weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
            <div className="staff-appointments__days">
              {cells.map((cell) => cell.day === null
                ? <span key={cell.key} aria-hidden="true" />
                : <button
                  key={cell.key}
                  type="button"
                  aria-label={`${MONTHS[calendarMonth.month]} ${cell.day}, ${calendarMonth.year}`}
                  aria-pressed={cell.key === selectedDate}
                  className={`${cell.key === selectedDate ? 'is-selected' : ''} ${cell.key === today ? 'is-today' : ''}`}
                  onClick={() => chooseDate(cell.key)}
                >{cell.day}</button>)}
            </div>
            <p className="staff-appointments__calendar-note">Select a date to view its appointment list.</p>
          </aside>

          <section className="staff-appointments__queue" aria-labelledby="staff-appointments-date">
            <header className="staff-appointments__queue-head">
              <div>
                <p className="staff-appointments__eyebrow">Selected date</p>
                <h2 id="staff-appointments-date">{selectedDateLabel(selectedDate)}</h2>
              </div>
              {!loading && !error && <span className="staff-appointments__count">{appointments.length} on this page</span>}
            </header>

            {error && <p className="staff-appointments__message is-error" role="alert">{error}</p>}
            {actionError && <p className="staff-appointments__message is-error" role="alert">{actionError}</p>}
            {actionNotice && <p className="staff-appointments__message" role="status">{actionNotice}</p>}
            {loading && <p className="staff-appointments__message" role="status">Loading appointments…</p>}
            {!loading && !error && appointments.length === 0 && <p className="staff-appointments__message" role="status">No appointments are scheduled for this date.</p>}

            {!loading && !error && groupedAppointments.map((group) => (
              <section className="staff-appointments__period" key={group.id}>
                <header><span aria-hidden="true">{group.id === 'morning' ? '☀' : group.id === 'evening' ? '☾' : '◷'}</span><h3>{group.label}</h3><small>{group.appointments.length} {group.appointments.length === 1 ? 'appointment' : 'appointments'}</small></header>
                <div className="staff-appointments__list">
                  {group.appointments.map((appointment) => (
                    <article className="staff-appointments__appointment" key={appointment.id}>
                      <time dateTime={appointment.startsAt}>{formatTime(appointment.startsAt)}</time>
                      <div className="staff-appointments__patient">
                        <strong>{patientName(appointment)}</strong>
                        <span>{patientPhone(appointment)}</span>
                        <small>{appointment.reference || 'No reference'} · {appointment.visitMode === 'video' ? 'Video consultation' : 'In-clinic visit'}</small>
                      </div>
                      <span className={`staff-appointments__status staff-appointments__status--${appointment.status}`}>{appointment.status.replaceAll('_', ' ')}</span>
                      {(getAppointmentActions(appointment, role, today).length > 0 || canStaffRescheduleAppointment(appointment, role, doctorId)) && (
                        <div className="staff-appointments__appointment-actions" aria-label={`Actions for ${appointment.reference || 'appointment'}`}>
                          {getAppointmentActions(appointment, role, today).map((action) => (
                            <button key={action.to} type="button" disabled={savingId === appointment.id}
                              onClick={() => applyAction(appointment, action)}>
                              {savingId === appointment.id ? 'Saving…' : action.label}
                            </button>
                          ))}
                          {canStaffRescheduleAppointment(appointment, role, doctorId) && <button type="button" onClick={() => { setActionNotice(''); setReschedule(appointment); }}>Reschedule</button>}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            ))}

            <footer className="staff-appointments__pagination">
              <button type="button" disabled={loading || !cursor} onClick={() => setCursor(null)}>First page</button>
              <button type="button" disabled={loading || !nextCursor} onClick={() => setCursor(nextCursor)}>Next page</button>
            </footer>
          </section>
        </div>
      </main>
      <RescheduleDialog
        open={Boolean(reschedule)}
        appointment={reschedule}
        onClose={() => setReschedule(null)}
        onDone={(message) => { setReschedule(null); setActionNotice(message); setRevision((value) => value + 1); }}
      />
    </StaffLayout>
  );
}
