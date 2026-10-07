import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, getDoc, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore';
import { Link, Navigate } from 'react-router-dom';
import NotificationMenu from '../components/NotificationMenu';
import { publicUrl } from '../lib/portals';
import { auth, firestore } from '../lib/firebase';
import { addIstDays, istDateKey, istInstant, startOfIstWeekMonday, toIstParts, weekdayIst } from '../lib/ist';
import { normalizeSchedule, sessionsFromWeekly, weeklyFromSessions } from '../lib/schedule';
import { toDate } from '../lib/time';
import { transitionAppointment } from '../services/appointmentService';

const DOCTOR_ID = 'brig-ak-sood';
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const IST = 'Asia/Kolkata';
const defaultWeekly = () => Object.fromEntries(DAYS.map((_, day) => [day, { enabled: day !== 0, windows: day === 0 ? [] : [['08:00', '10:00'], ['17:00', '18:30']] }]));
const greeting = () => { const { hour } = toIstParts(new Date()); return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'; };
const formatDate = (date, options) => date.toLocaleDateString('en-IN', { timeZone: IST, ...options });
const formatTime = (value) => { const date = toDate(value); return date ? date.toLocaleTimeString('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit' }) : 'Time unavailable'; };

const DoctorSchedule = () => {
  const [user, setUser] = useState(undefined);
  const [allowed, setAllowed] = useState(false);
  const [appointments, setAppointments] = useState([]);
  const [weekly, setWeekly] = useState(defaultWeekly());
  const [weekStart, setWeekStart] = useState(startOfIstWeekMonday());
  const [selected, setSelected] = useState(istInstant(istDateKey()));
  const [notice, setNotice] = useState('');
  const [exception, setException] = useState({ status: 'available', start: '08:00', end: '10:00' });

  useEffect(() => onAuthStateChanged(auth, async (next) => {
    if (!next) { setUser(null); return; }
    const token = await next.getIdTokenResult();
    setUser(next);
    setAllowed(token.claims.role === 'doctor' && token.claims.doctorId === DOCTOR_ID);
  }), []);

  useEffect(() => {
    if (!allowed) return undefined;
    const stopAppointments = onSnapshot(
      query(collection(firestore, 'appointments'), where('doctorId', '==', DOCTOR_ID), orderBy('startsAt', 'asc')),
      (snapshot) => setAppointments(snapshot.docs.map((item) => {
        const appointment = item.data();
        return { id: item.id, ...appointment, startsAt: toDate(appointment.startsAt), endsAt: toDate(appointment.endsAt), patient: appointment.patientSnapshot || appointment.patient };
      })),
      () => setNotice('Appointments could not be loaded.'),
    );
    Promise.all([getDoc(doc(firestore, 'doctorSchedules', DOCTOR_ID)), getDoc(doc(firestore, 'clinicSchedules', DOCTOR_ID))]).then(([scheduleSnapshot, legacySnapshot]) => {
      const rawSchedule = scheduleSnapshot.exists() ? scheduleSnapshot.data() : (legacySnapshot.exists() ? legacySnapshot.data() : null);
      if (rawSchedule) setWeekly(weeklyFromSessions(normalizeSchedule(rawSchedule), defaultWeekly()));
    }).catch(() => setNotice('Weekly hours could not be loaded.'));
    return stopAppointments;
  }, [allowed]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => istInstant(addIstDays(istDateKey(weekStart), index))), [weekStart]);
  const selectedKey = istDateKey(selected);
  const selectedAppointments = appointments.filter((appointment) => { const startsAt = toDate(appointment.startsAt); return startsAt && istDateKey(startsAt) === selectedKey; });
  const moveWeek = (daysToMove) => setWeekStart(istInstant(addIstDays(istDateKey(weekStart), daysToMove)));
  const hoursFor = (date) => weekly[weekdayIst(istDateKey(date))] || { enabled: false, windows: [] };
  const saveWeekly = async () => { try { await setDoc(doc(firestore, 'doctorSchedules', DOCTOR_ID), { doctorId: DOCTOR_ID, sessions: sessionsFromWeekly(weekly), updatedAt: new Date().toISOString(), updatedBy: user.uid }, { merge: true }); setNotice('Regular clinic hours saved. Patients will see these hours in the booking calendar.'); } catch { setNotice('Unable to save regular hours.'); } };
  const toggleDay = (day) => setWeekly((current) => ({ ...current, [day]: { ...current[day], enabled: !current[day].enabled } }));
  const setWindow = (day, index, position, value) => setWeekly((current) => ({ ...current, [day]: { ...current[day], windows: current[day].windows.map((window, windowIndex) => windowIndex === index ? position === 0 ? [value, window[1]] : [window[0], value] : window) } }));
  const saveException = async (event) => { event.preventDefault(); if (exception.status === 'available' && exception.start >= exception.end) { setNotice('The end time must be after the start time.'); return; } try { await setDoc(doc(firestore, 'scheduleExceptions', `${DOCTOR_ID}_${selectedKey}`), { doctorId: DOCTOR_ID, dateKey: selectedKey, type: exception.status === 'available' ? 'extra' : 'closed', sessions: exception.status === 'available' ? [{ start: exception.start, end: exception.end }] : [], updatedAt: new Date().toISOString(), updatedBy: user.uid }); setNotice(exception.status === 'available' ? `Special hours saved for ${selectedKey}.` : `${selectedKey} is marked unavailable.`); } catch { setNotice('Unable to save the date exception.'); } };
  const changeStatus = async (appointment, status) => { const reason = status === 'cancelled' ? window.prompt('Cancellation reason (required):') : ''; if (status === 'cancelled' && !reason?.trim()) return; try { await transitionAppointment(appointment.id, status, reason); setNotice(`Appointment marked ${status.replace('_', ' ')}.`); } catch (error) { setNotice(error?.message || 'Unable to update this appointment.'); } };

  if (user === undefined) return <main className="staff-shell"><p className="workspace-status">Verifying staff access…</p></main>;
  if (!user) return <Navigate to="/staff/login" replace />;
  if (!allowed) return <main className="staff-shell"><section className="workspace-gate"><p>SOOD CLINIC STAFF</p><h1>Doctor access required</h1><span>This account is not assigned to the doctor workspace.</span><button className="staff-secondary-button" type="button" onClick={() => signOut(auth)}>Sign out</button></section></main>;

  return <main className="staff-shell"><header className="staff-topbar"><Link to="/" className="staff-wordmark">SOOD CLINIC</Link><nav><Link to="/staff/doctor" className="is-active">Calendar</Link><NotificationMenu /><Link to="/staff/account">My account</Link><a href={publicUrl('/')}>View public site</a><button type="button" onClick={() => signOut(auth)}>Sign out</button></nav></header><div className="staff-admin doctor-calendar"><header className="staff-admin__heading"><div><p className="section-kicker">Clinical schedule</p><h1>{greeting()}, {user.displayName || 'Dr. Sood'}</h1><span>Manage weekly consultations and day-specific clinic availability from one calendar.</span></div><div className="staff-admin__identity"><strong>{appointments.filter((item) => item.status === 'scheduled').length} scheduled</strong><span>Appointments in the current clinic record</span></div></header>{notice && <p className="admin-notice" role="status">{notice}</p>}<section className="doctor-calendar__board"><div className="doctor-calendar__toolbar"><div><p className="section-kicker">Week view</p><h2>{formatDate(weekStart, { month: 'long', year: 'numeric' })}</h2></div><div><button type="button" onClick={() => moveWeek(-7)}>← Previous</button><button type="button" onClick={() => setWeekStart(startOfIstWeekMonday())}>Today</button><button type="button" onClick={() => moveWeek(7)}>Next →</button></div></div><div className="doctor-week-grid">{days.map((date) => { const dateKey = istDateKey(date); const dayAppointments = appointments.filter((item) => item.startsAt && istDateKey(new Date(item.startsAt)) === dateKey); const active = dateKey === selectedKey; const hours = hoursFor(date); return <button type="button" onClick={() => setSelected(date)} className={`doctor-day${active ? ' doctor-day--selected' : ''}`} key={dateKey}><span>{formatDate(date, { weekday: 'short' })}</span><strong>{toIstParts(date).day}</strong><small>{dayAppointments.length ? `${dayAppointments.length} booked` : hours.enabled ? 'Open' : 'Closed'}</small></button>; })}</div></section><section className="doctor-calendar__details"><section className="admin-panel doctor-appointments"><div className="admin-panel__head"><div><p className="section-kicker">Selected day</p><h2>{formatDate(selected, { weekday: 'long', day: 'numeric', month: 'long' })}</h2></div></div><div className="admin-appointment-list">{selectedAppointments.length ? selectedAppointments.map((appointment) => <article className="admin-appointment" key={appointment.id}><div><strong>{appointment.patient?.name || 'Patient'}</strong><span>{formatTime(appointment.startsAt)} · {appointment.patient?.phone || 'No phone'}</span><small>{appointment.reason || 'Consultation'}</small></div><div><span className={`appointment-status appointment-status--${appointment.status}`}>{appointment.status}</span>{appointment.status === 'scheduled' && <div className="admin-appointment__actions"><button type="button" onClick={() => changeStatus(appointment, 'completed')}>Complete</button><button className="button-danger" type="button" onClick={() => changeStatus(appointment, 'cancelled')}>Cancel</button></div>}</div></article>) : <p className="empty-state">No appointments on this day.</p>}</div></section><form className="admin-panel admin-form" onSubmit={saveException}><div><p className="section-kicker">Date exception</p><h2>Special hours for {selectedKey}</h2><span>Open an overtime/Sunday clinic, or close this date. This takes precedence over recurring hours.</span></div><label>Status<select value={exception.status} onChange={(event) => setException({ ...exception, status: event.target.value })}><option value="available">Open special hours</option><option value="unavailable">Mark unavailable</option></select></label>{exception.status === 'available' && <div className="admin-time-pair"><label>From<input type="time" value={exception.start} onChange={(event) => setException({ ...exception, start: event.target.value })} /></label><label>To<input type="time" value={exception.end} onChange={(event) => setException({ ...exception, end: event.target.value })} /></label></div>}<button type="submit">Save date exception</button></form></section><section className="admin-panel doctor-recurring"><div className="admin-panel__head"><div><p className="section-kicker">Regular clinic hours</p><h2>Weekly availability</h2></div><button type="button" className="doctor-save-hours" onClick={saveWeekly}>Save weekly hours</button></div><div className="weekly-hours">{DAYS.map((day, index) => <article key={day}><div><strong>{day}</strong><label className="schedule-toggle"><input type="checkbox" checked={weekly[index]?.enabled || false} onChange={() => toggleDay(index)} /><span>{weekly[index]?.enabled ? 'Open' : 'Closed'}</span></label></div>{weekly[index]?.enabled && weekly[index].windows.map((window, windowIndex) => <div className="weekly-hours__window" key={`${day}-${windowIndex}`}><input type="time" value={window[0]} onChange={(event) => setWindow(index, windowIndex, 0, event.target.value)} /><span>to</span><input type="time" value={window[1]} onChange={(event) => setWindow(index, windowIndex, 1, event.target.value)} /></div>)}</article>)}</div></section></div></main>;
};

export default DoctorSchedule;
