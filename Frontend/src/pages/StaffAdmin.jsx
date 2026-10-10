import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore';
import { Link, Navigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { auth, firestore, functions } from '../lib/firebase';
import { addIstDays, istDateKey, toIstParts } from '../lib/ist';
import { formatDateTime, patientName, patientPhone } from '../lib/time';
import { closeDay, transitionAppointment } from '../services/appointmentService';
import { allowedAppointmentTransitions, appointmentActionLabel } from '../lib/appointmentState';
import NotificationMenu from '../components/NotificationMenu';
import { publicUrl } from '../lib/portals';

const dateKey = (date = new Date()) => istDateKey(date);
const greeting = () => { const { hour } = toIstParts(new Date()); return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'; };

const StaffAdmin = () => {
  const [state, setState] = useState('checking');
  const [appointments, setAppointments] = useState([]);
  const [staff, setStaff] = useState([]);
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('scheduled');
  const [queueDate, setQueueDate] = useState(() => dateKey());
  const [override, setOverride] = useState({ date: dateKey(), status: 'available', start: '08:00', end: '10:00' });
  const [closePreview, setClosePreview] = useState(null);
  const [closeReason, setCloseReason] = useState('');
  const [calendar, setCalendar] = useState({ loading: true, connected: false });
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) { setState('signed-out'); return; }
    const token = await user.getIdTokenResult();
    setState(token.claims.forcePasswordChange === true ? 'password-change' : token.claims.role === 'admin' ? 'allowed' : 'denied');
  }), []);

  useEffect(() => {
    if (state !== 'allowed') return undefined;
    const stopAppointments = onSnapshot(query(collection(firestore, 'appointments'), where('dateKey', '==', queueDate), orderBy('startsAt', 'asc')), (snapshot) => {
      setAppointments(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    }, () => setNotice('Appointments could not be loaded. Check the administrator role assignment.'));
    const stopStaff = onSnapshot(collection(firestore, 'staffProfiles'), (snapshot) => {
      setStaff(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    }, () => setNotice('Staff directory could not be loaded.'));
    return () => { stopAppointments(); stopStaff(); };
  }, [state, queueDate]);

  useEffect(() => {
    if (state !== 'allowed') return;
    let active = true;
    httpsCallable(functions, 'getAdminBookingCatalog')().then((result) => {
      if (!active) return;
      const nextDoctors = (result.data?.doctors || []).filter((doctor) => doctor.active !== false);
      setDoctors(nextDoctors);
      setSelectedDoctorId((current) => current && nextDoctors.some((doctor) => doctor.id === current) ? current : nextDoctors[0]?.id || '');
    }).catch((error) => {
      if (active) setNotice(error?.message || 'Clinic providers could not be loaded.');
    });
    return () => { active = false; };
  }, [state]);

  const refreshCalendarStatus = async () => {
    setCalendar((current) => ({ ...current, loading: true, error: '' }));
    try {
      const result = await httpsCallable(functions, 'googleCalendarStatus')();
      setCalendar({ loading: false, error: '', ...result.data });
    } catch (error) {
      setCalendar({ loading: false, connected: false, error: error?.message || 'Calendar status could not be loaded.' });
    }
  };

  useEffect(() => {
    if (state !== 'allowed') return;
    refreshCalendarStatus();
  }, [state]);

  const summary = useMemo(() => ({
    scheduled: appointments.filter((item) => item.status === 'scheduled').length,
    completed: appointments.filter((item) => item.status === 'completed').length,
    cancelled: appointments.filter((item) => item.status === 'cancelled').length,
  }), [appointments]);
  const visibleAppointments = filter === 'all' ? appointments : appointments.filter((item) => item.status === filter);
  const moveQueueDay = (amount) => setQueueDate((currentDate) => addIstDays(currentDate, amount));

  const updateAppointment = async (appointment, nextStatus) => {
    const reason = nextStatus === 'cancelled' ? window.prompt('Cancellation reason (required):') : '';
    if (nextStatus === 'cancelled' && !reason?.trim()) return;
    try { await transitionAppointment(appointment.id, nextStatus, reason); setNotice(`Appointment marked ${nextStatus.replace('_', ' ')}.`); }
    catch (error) { setNotice(error?.message || 'Unable to update the appointment.'); }
  };

  const requireSelectedDoctor = () => {
    if (selectedDoctorId) return true;
    setNotice('Add an active provider in Booking setup before managing availability.');
    return false;
  };

  const saveOverride = async (event) => {
    event.preventDefault();
    if (!requireSelectedDoctor()) return;
    if (override.status === 'available' && override.start >= override.end) { setNotice('The end time must be after the start time.'); return; }
    if (override.status === 'unavailable') {
      try {
        const result = await closeDay({ doctorId: selectedDoctorId, dateKey: override.date });
        setClosePreview(result.data);
        setCloseReason('');
        setNotice(result.data.appointments.length ? 'Review the affected appointments before closing this day.' : 'No active appointments are affected. Confirm to close the day.');
      } catch (error) { setNotice(error?.message || 'Unable to review this clinic day.'); }
      return;
    }
    try {
      await setDoc(doc(firestore, 'scheduleExceptions', `${selectedDoctorId}_${override.date}`), {
        doctorId: selectedDoctorId, dateKey: override.date, type: override.status === 'available' ? 'extra' : 'closed',
        sessions: override.status === 'available' ? [{ start: override.start, end: override.end }] : [],
        updatedAt: new Date().toISOString(), updatedBy: auth.currentUser.uid,
      });
      setNotice(override.status === 'available' ? `Special clinic hours saved for ${override.date}.` : `Clinic marked unavailable for ${override.date}.`);
    } catch { setNotice('Unable to save clinic availability.'); }
  };

  const applyDayClosure = async (action) => {
    if (action === 'cancel' && !closeReason.trim()) { setNotice('Enter a cancellation reason before closing the day.'); return; }
    try {
      const result = await closeDay({ doctorId: selectedDoctorId, dateKey: override.date, mode: 'apply', action, reason: closeReason });
      setClosePreview(null); setCloseReason('');
      setNotice(result.data.affectedAppointments ? `Clinic day closed. ${result.data.affectedAppointments} appointment${result.data.affectedAppointments === 1 ? '' : 's'} ${action === 'cancel' ? 'cancelled' : 'kept'} for follow-up.` : 'Clinic day closed.');
    } catch (error) { setNotice(error?.message || 'Unable to close this clinic day.'); }
  };

  const connectCalendar = async () => {
    if (!requireSelectedDoctor()) return;
    setCalendarBusy(true);
    try {
      const result = await httpsCallable(functions, 'beginGoogleCalendarConnection')({ doctorId: selectedDoctorId, calendarId: 'primary' });
      const authorizationUrl = result.data?.authorizationUrl;
      if (!authorizationUrl) throw new Error('Google Calendar did not return an authorization link.');
      const calendarWindow = window.open(authorizationUrl, '_blank', 'noopener,noreferrer');
      if (!calendarWindow) window.location.assign(authorizationUrl);
      else setNotice('Finish Google Calendar consent in the opened tab, then use Refresh status here.');
    } catch (error) {
      setNotice(error?.message || 'Unable to start the Google Calendar connection.');
    } finally {
      setCalendarBusy(false);
    }
  };
  const disconnectCalendar = async () => {
    if (!window.confirm('Disconnect Google Calendar? Existing clinic appointments will remain in this portal.')) return;
    setCalendarBusy(true);
    try {
      await httpsCallable(functions, 'disconnectGoogleCalendar')();
      await refreshCalendarStatus();
      setNotice('Google Calendar has been disconnected.');
    } catch (error) {
      setNotice(error?.message || 'Unable to disconnect Google Calendar.');
    } finally {
      setCalendarBusy(false);
    }
  };

  if (state === 'signed-out') return <Navigate to="/staff/login" replace />;
  if (state === 'password-change') return <Navigate to="/staff/account" replace />;
  if (state === 'denied') return <main className="staff-shell"><section className="workspace-gate"><p>SOOD CLINIC STAFF</p><h1>Administrator access required</h1><span>Your account is signed in, but it is not assigned the <code>admin</code> role. A project administrator must grant that role with the trusted Firebase Admin command.</span><button type="button" className="staff-secondary-button" onClick={() => signOut(auth)}>Sign out</button></section></main>;
  if (state === 'checking') return <main className="staff-shell"><p className="workspace-status">Verifying secure administrator access…</p></main>;

  return <main className="staff-shell">
    <header className="staff-topbar">
      <Link to="/" className="staff-wordmark">SOOD CLINIC</Link>
      <nav><Link to="/staff/admin" className="is-active">Overview</Link><Link to="/staff/admin/patients">Patients</Link><Link to="/staff/admin/catalogue">Booking setup</Link><Link to="/staff/admin/visit-types">Visit formats</Link><Link to="/staff/video">Video visits</Link><Link to="/staff/admin/feedback">Feedback</Link><Link to="/staff/admin/access">Staff access</Link><Link to="/staff/admin/audit">Activity</Link><NotificationMenu /><Link to="/staff/account">My account</Link><a href={publicUrl('/')}>View public site</a><button type="button" onClick={() => signOut(auth)}>Sign out</button></nav>
    </header>
    <div className="staff-admin">
      <header className="staff-admin__heading"><div><p className="section-kicker">Clinic operations</p><h1>{greeting()}, {auth.currentUser?.displayName || 'Administrator'}</h1><span>Monitor appointments, manage clinic availability, and maintain the internal staff directory.</span></div><div className="staff-admin__identity"><strong>{auth.currentUser?.displayName || 'Administrator'}</strong><span>Clinic administrator</span></div></header>
      <section className="admin-metrics" aria-label="Appointment overview"><article><span>Scheduled</span><strong>{summary.scheduled}</strong><small>Awaiting consultation</small></article><article><span>Completed</span><strong>{summary.completed}</strong><small>Closed consultations</small></article><article><span>Cancelled</span><strong>{summary.cancelled}</strong><small>Released time slots</small></article><article><span>Directory</span><strong>{staff.length}</strong><small>Internal staff records</small></article></section>
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      <section className="admin-grid">
        <section className="admin-panel admin-panel--appointments"><div className="admin-panel__head"><div><p className="section-kicker">Appointment desk</p><h2>Consultation queue</h2></div><select aria-label="Filter appointments" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="scheduled">Scheduled</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="all">All appointments</option></select></div><div className="reception-queue__date" aria-label="Queue date"><button type="button" onClick={() => moveQueueDay(-1)}>← Previous</button><label>Clinic date<input type="date" value={queueDate} onChange={(event) => setQueueDate(event.target.value)} /></label><button type="button" onClick={() => setQueueDate(dateKey())}>Today</button><button type="button" onClick={() => moveQueueDay(1)}>Next →</button></div><div className="admin-appointment-list">{visibleAppointments.length ? visibleAppointments.map((appointment) => { const actions = allowedAppointmentTransitions(appointment.status, 'admin'); return <article key={appointment.id} className="admin-appointment"><div><strong>{patientName(appointment)}</strong><span>{formatDateTime(appointment.startsAt)}</span><small>{patientPhone(appointment)} · {appointment.reason || 'No reason supplied'}</small></div><div><span className={`appointment-status appointment-status--${appointment.status}`}>{appointment.status}</span>{actions.length > 0 && <div className="admin-appointment__actions">{actions.filter((status) => status !== 'no_show').map((status) => <button key={status} type="button" className={status === 'cancelled' ? 'button-danger' : ''} onClick={() => updateAppointment(appointment, status)}>{appointmentActionLabel(status)}</button>)}</div>}</div></article>; }) : <p className="empty-state">No {filter === 'all' ? '' : filter} appointments for {queueDate}.</p>}</div></section>
        <form className="admin-panel admin-form" onSubmit={saveOverride}><div><p className="section-kicker">Calendar authority</p><h2>Exceptional availability</h2><span>Regular clinic hours remain active. Use this only for closures, special clinics, or overtime.</span></div><label>Provider<select value={selectedDoctorId} onChange={(event) => { setSelectedDoctorId(event.target.value); setClosePreview(null); }} disabled={!doctors.length}><option value="">{doctors.length ? 'Select a provider' : 'No active providers configured'}</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></label><label>Date<input type="date" value={override.date} min={dateKey()} onChange={(event) => { setOverride({ ...override, date: event.target.value }); setClosePreview(null); }} required /></label><label>Day status<select value={override.status} onChange={(event) => { setOverride({ ...override, status: event.target.value }); setClosePreview(null); }}><option value="available">Open special hours</option><option value="unavailable">Mark unavailable</option></select></label>{override.status === 'available' && <div className="admin-time-pair"><label>From<input type="time" value={override.start} onChange={(event) => setOverride({ ...override, start: event.target.value })} required /></label><label>To<input type="time" value={override.end} onChange={(event) => setOverride({ ...override, end: event.target.value })} required /></label></div>}<button type="submit" disabled={!selectedDoctorId}>{override.status === 'unavailable' ? 'Review closure' : 'Save availability'}</button>{closePreview && <section className="admin-day-closure"><strong>{closePreview.appointments.length} active appointment{closePreview.appointments.length === 1 ? '' : 's'} affected</strong>{closePreview.appointments.length > 0 && <><span>Closing prevents new bookings. Existing appointments may be kept, or cancelled with a reason.</span><label>Cancellation reason<textarea value={closeReason} onChange={(event) => setCloseReason(event.target.value)} placeholder="Explain the clinic closure" /></label></>}<div><button type="button" className="staff-secondary-button" onClick={() => applyDayClosure('keep')}>Close day, keep appointments</button>{closePreview.appointments.length > 0 && <button type="button" className="button-danger" onClick={() => applyDayClosure('cancel')}>Cancel appointments & close</button>}</div></section>}</form>
        <section className="admin-panel admin-form calendar-connection"><div><p className="section-kicker">External calendar</p><h2>Google Calendar</h2><span>Keep the clinic schedule in this portal, with Google Calendar used only for availability and appointment mirroring.</span></div><label>Provider<select value={selectedDoctorId} onChange={(event) => setSelectedDoctorId(event.target.value)} disabled={!doctors.length}><option value="">{doctors.length ? 'Select a provider' : 'No active providers configured'}</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></label><div className={`calendar-connection__status${calendar.connected ? ' calendar-connection__status--connected' : ''}`}><strong>{calendar.loading ? 'Checking connection…' : calendar.connected ? 'Connected' : 'Not connected'}</strong><span>{calendar.error || (calendar.connected ? `${calendar.calendarId || 'Primary calendar'} · ${calendar.doctorId === selectedDoctorId ? 'Ready to sync this provider' : 'Connected to another provider'} · ${calendar.syncStatus === 'degraded' ? 'Needs attention' : 'Ready to sync'}` : 'Connect the clinic-owned Google Calendar when you are ready.')}</span></div><div className="calendar-connection__actions"><button type="button" className="staff-secondary-button" onClick={refreshCalendarStatus} disabled={calendarBusy || calendar.loading}>Refresh status</button>{calendar.connected ? <button type="button" className="button-danger" onClick={disconnectCalendar} disabled={calendarBusy}>{calendarBusy ? 'Disconnecting…' : 'Disconnect'}</button> : <button type="button" onClick={connectCalendar} disabled={calendarBusy || calendar.loading || !selectedDoctorId}>{calendarBusy ? 'Opening Google…' : 'Connect Google Calendar'}</button>}</div></section>
        <section className="admin-panel admin-form"><div><p className="section-kicker">Staff accounts</p><h2>Identity & access</h2><span>Create staff accounts, assign a role or doctor ID, revoke sessions, suspend access, and set a temporary password from a dedicated protected workspace.</span></div><Link className="staff-secondary-button" to="/staff/admin/access">Manage staff access</Link></section>
        <section className="admin-panel admin-form"><div><p className="section-kicker">Patient records</p><h2>Patient search & profiles</h2><span>Use the protected directory to find a patient and make a controlled update to their registered details.</span></div><Link className="staff-secondary-button" to="/staff/admin/patients">Manage patient records</Link></section>
        <section className="admin-panel admin-form"><div><p className="section-kicker">Booking configuration</p><h2>Clinic catalogue</h2><span>Manage the active branches, services and doctors available to patients when booking online.</span></div><Link className="staff-secondary-button" to="/staff/admin/catalogue">Manage booking setup</Link></section>
        <section className="admin-panel admin-form"><div><p className="section-kicker">Governance</p><h2>Activity log</h2><span>Review the latest protected operational events. Sensitive record details are intentionally excluded from this view.</span></div><Link className="staff-secondary-button" to="/staff/admin/audit">View activity</Link></section>
        <section className="admin-panel admin-panel--directory"><div className="admin-panel__head"><div><p className="section-kicker">Team</p><h2>Staff directory</h2></div><Link to="/staff/admin/access">Open access controls</Link></div>{staff.length ? <ul className="staff-directory">{staff.slice(0, 5).map((member) => <li key={member.id}><div><strong>{member.name}</strong><span>{member.email}</span></div><div className="staff-directory__actions"><span>{member.active === false ? 'Suspended' : member.role}</span></div></li>)}</ul> : <p className="empty-state">No internal staff records yet.</p>}<p className="admin-panel__footnote">Account lifecycle changes are performed only by the protected server-side access service and recorded in the audit log.</p></section>
      </section>
    </div>
  </main>;
};

export default StaffAdmin;
