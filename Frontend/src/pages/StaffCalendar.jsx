import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { auth, firestore } from '../lib/firebase';
import { addIstDays, istDateKey, istInstant, startOfIstWeekMonday, toIstParts } from '../lib/ist';
import { toDate } from '../lib/time';
import { layoutEvents } from '../features/scheduler/layoutEvents';
import { allowedTransitions } from '../features/scheduler/stateMachine';
import { deleteCalendarBlock, saveCalendarBlock, transitionAppointment } from '../services/schedulerService';

const formatTime = (value) => toDate(value)?.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' }) || '';

const StaffCalendar = () => {
  const [user, setUser] = useState(undefined);
  const [claims, setClaims] = useState(null);
  const [params, setParams] = useSearchParams();
  const view = params.get('view') || 'week';
  const dateKey = params.get('date') || istDateKey();
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [claimsReady, setClaimsReady] = useState(false);
  const [blocks, setBlocks] = useState([]);
  const [blockForm, setBlockForm] = useState({ dateKey, start: '13:00', end: '14:00', reason: '' });
  const date = istInstant(dateKey);
  const start = view === 'week' ? startOfIstWeekMonday(date) : date;
  const days = useMemo(
    () => (view === 'day'
      ? [date]
      : Array.from(
        { length: view === 'month' ? 14 : 7 },
        (_, index) => istInstant(addIstDays(istDateKey(start), index)),
      )),
    [date, start, view],
  );
  const from = istDateKey(days[0]);
  const to = istDateKey(days[days.length - 1]);

  useEffect(() => onAuthStateChanged(auth, async (next) => {
    if (!next) { setUser(null); setClaimsReady(true); return; }
    const token = await next.getIdTokenResult();
    setUser(next); setClaims(token.claims); setClaimsReady(true);
  }), []);

  useEffect(() => {
    if (!claims?.role) return undefined;
    const doctorIds = claims.role === 'doctor' ? [claims.doctorId] : [];
    const constraints = [where('dateKey', '>=', from), where('dateKey', '<=', to), orderBy('dateKey'), orderBy('startsAt')];
    const base = collection(firestore, 'appointments');
    const appointmentQuery = doctorIds.length
      ? query(base, where('doctorId', '==', doctorIds[0]), ...constraints)
      : query(base, ...constraints);
    return onSnapshot(appointmentQuery, (snapshot) => setEvents(snapshot.docs.map((item) => ({ id: item.id, ...item.data(), startsAt: toDate(item.data().startsAt), endsAt: toDate(item.data().endsAt) }))), () => setError('Calendar appointments could not be loaded.'));
  }, [claims, from, to]);

  useEffect(() => {
    if (!claims?.role) return undefined;
    const blockQuery = query(collection(firestore, 'calendarBlocks'), where('dateKey', '>=', from), where('dateKey', '<=', to), orderBy('dateKey'));
    return onSnapshot(blockQuery, (snapshot) => setBlocks(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), () => setError('Calendar blocks could not be loaded.'));
  }, [claims, from, to]);

  const eventsByDay = useMemo(() => days.map((day) => {
    const key = istDateKey(day);
    return { day, key, events: layoutEvents(events.filter((event) => event.dateKey === key)) };
  }), [days, events]);
  const move = (amount) => setParams({ view, date: addIstDays(dateKey, amount) });
  const setView = (next) => setParams({ view: next, date: dateKey });
  const transition = async (event, to) => {
    setError('');
    try {
      await transitionAppointment({ appointmentId: event.id, to, reason: to === 'cancelled' ? 'Cancelled from staff calendar' : undefined });
    } catch {
      setError('That appointment could not be updated. Refresh and try again.');
    }
  };
  const createBlock = async (event) => {
    event.preventDefault();
    const doctorId = claims.role === 'doctor' ? claims.doctorId : params.get('doctorId');
    if (!doctorId) { setError('Choose a doctor before creating a calendar block.'); return; }
    try {
      await saveCalendarBlock({ doctorId, ...blockForm });
      setBlockForm((current) => ({ ...current, reason: '' }));
    } catch { setError('That calendar block could not be saved.'); }
  };
  const removeBlock = async (blockId) => {
    try { await deleteCalendarBlock({ blockId }); } catch { setError('That calendar block could not be removed.'); }
  };

  if (user === undefined || !claimsReady) return <main className="staff-shell"><p className="workspace-status">Verifying staff access…</p></main>;
  if (!user) return <Navigate to="/staff/login" replace />;
  if (!['admin', 'manager', 'doctor'].includes(claims?.role)) return <Navigate to="/staff" replace />;

  return <main className="staff-shell"><header className="staff-topbar"><Link to="/staff" className="staff-wordmark">SOOD CLINIC</Link><nav><Link to="/staff/calendar" className="is-active">Calendar</Link><Link to="/staff/today">Today</Link><Link to="/staff/account">My account</Link><button type="button" onClick={() => signOut(auth)}>Sign out</button></nav></header><div className="staff-admin scheduler-staff"><header className="staff-admin__heading"><div><p className="section-kicker">Staff scheduler</p><h1>{view === 'day' ? 'Day view' : view === 'month' ? 'Month view' : view === 'agenda' ? 'Agenda' : 'Week view'}</h1><span>{from} to {to} · clinic appointments only</span></div><div className="scheduler-staff__controls"><button type="button" onClick={() => setParams({ view, date: istDateKey() })}>Today</button><button type="button" onClick={() => move(view === 'day' ? -1 : -7)}>←</button><button type="button" onClick={() => move(view === 'day' ? 1 : 7)}>→</button>{['day', 'week', 'month', 'agenda'].map((item) => <button key={item} className={view === item ? 'is-active' : ''} type="button" onClick={() => setView(item)}>{item}</button>)}</div></header>{error && <p className="admin-notice" role="alert">{error}</p>}<section className="admin-panel scheduler-block-panel"><h2>Block clinic time</h2><form onSubmit={createBlock}><input type="date" value={blockForm.dateKey} onChange={(event) => setBlockForm({ ...blockForm, dateKey: event.target.value })} required /><input type="time" value={blockForm.start} onChange={(event) => setBlockForm({ ...blockForm, start: event.target.value })} required /><input type="time" value={blockForm.end} onChange={(event) => setBlockForm({ ...blockForm, end: event.target.value })} required /><input value={blockForm.reason} onChange={(event) => setBlockForm({ ...blockForm, reason: event.target.value })} placeholder="Reason" required /><button type="submit">Add block</button></form>{blocks.map((block) => <div key={block.id}><span>{block.dateKey} · {block.reason}</span><button type="button" onClick={() => removeBlock(block.id)}>Remove</button></div>)}</section>{view === 'agenda' ? <section className="admin-panel scheduler-agenda">{eventsByDay.map(({ key, events: dayEvents }) => <div key={key}><h2>{key}</h2>{dayEvents.length ? dayEvents.map((event) => <article key={event.id}><strong>{formatTime(event.startsAt)}–{formatTime(event.endsAt)}</strong><span>{event.patientSnapshot?.name || 'Patient'} · {event.visitTypeLabel || event.visitType || 'Consultation'}</span><small>{event.status}</small><div className="scheduler-event-actions">{allowedTransitions(event.status, claims.role).slice(0, 2).map((to) => <button key={to} type="button" onClick={() => transition(event, to)}>{to.replace('_', ' ')}</button>)}</div></article>) : <p>No appointments</p>}</div>)}</section> : <section className={`scheduler-staff-grid scheduler-staff-grid--${view}`}>{eventsByDay.map(({ day, key, events: dayEvents }) => <article key={key} className="scheduler-staff-day"><header><strong>{toIstParts(day).day}</strong><span>{day.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short' })}</span></header>{dayEvents.map((event) => <div key={event.id} className="scheduler-staff-event" style={{ top: `${Math.max(0, ((toDate(event.startsAt)?.getTime() || 0) - istInstant(key, '07:00').getTime()) / 60000) * .9}px` }}><strong>{event.patientSnapshot?.name || 'Patient'}</strong><span>{formatTime(event.startsAt)} · {event.visitTypeLabel || event.visitType || 'Consultation'}</span><small>{event.status}</small><div className="scheduler-event-actions">{allowedTransitions(event.status, claims.role).slice(0, 2).map((to) => <button key={to} type="button" onClick={() => transition(event, to)}>{to.replace('_', ' ')}</button>)}</div></div>)}</article>)}</section>}</div></main>;
};

export default StaffCalendar;
