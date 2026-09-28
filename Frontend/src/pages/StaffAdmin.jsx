import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, onSnapshot, orderBy, query, setDoc, writeBatch } from 'firebase/firestore';
import { Link, Navigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { auth, firestore, functions } from '../lib/firebase';

const DOCTOR_ID = 'brig-ak-sood';
const dateKey = (date = new Date()) => date.toISOString().slice(0, 10);
const formatDateTime = (value) => new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const greeting = () => new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';

const StaffAdmin = () => {
  const [state, setState] = useState('checking');
  const [appointments, setAppointments] = useState([]);
  const [staff, setStaff] = useState([]);
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('scheduled');
  const [override, setOverride] = useState({ date: dateKey(), status: 'available', start: '08:00', end: '10:00' });
  const [profile, setProfile] = useState({ name: '', email: '', role: 'receptionist', password: '' });

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) { setState('signed-out'); return; }
    const token = await user.getIdTokenResult();
    setState(token.claims.role === 'admin' ? 'allowed' : 'denied');
  }), []);

  useEffect(() => {
    if (state !== 'allowed') return undefined;
    const stopAppointments = onSnapshot(query(collection(firestore, 'appointments'), orderBy('startsAt', 'desc')), (snapshot) => {
      setAppointments(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    }, () => setNotice('Appointments could not be loaded. Check the administrator role assignment.'));
    const stopStaff = onSnapshot(collection(firestore, 'staffProfiles'), (snapshot) => {
      setStaff(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    }, () => setNotice('Staff directory could not be loaded.'));
    return () => { stopAppointments(); stopStaff(); };
  }, [state]);

  const summary = useMemo(() => ({
    scheduled: appointments.filter((item) => item.status === 'scheduled').length,
    completed: appointments.filter((item) => item.status === 'completed').length,
    cancelled: appointments.filter((item) => item.status === 'cancelled').length,
  }), [appointments]);
  const visibleAppointments = filter === 'all' ? appointments : appointments.filter((item) => item.status === filter);

  const updateAppointment = async (appointment, nextStatus) => {
    try {
      const batch = writeBatch(firestore);
      batch.update(doc(firestore, 'appointments', appointment.id), { status: nextStatus, updatedAt: new Date().toISOString(), updatedBy: auth.currentUser.uid });
      if (nextStatus === 'cancelled') {
        batch.update(doc(firestore, 'appointmentSlots', appointment.slotId), { status: 'available', appointmentId: null, updatedAt: new Date().toISOString() });
      }
      await batch.commit();
      setNotice(`Appointment marked ${nextStatus}.`);
    } catch {
      setNotice('Unable to update the appointment. Confirm this account has the administrator role.');
    }
  };

  const saveOverride = async (event) => {
    event.preventDefault();
    if (override.status === 'available' && override.start >= override.end) { setNotice('The end time must be after the start time.'); return; }
    try {
      await setDoc(doc(firestore, 'availabilityOverrides', `${DOCTOR_ID}_${override.date}`), {
        doctorId: DOCTOR_ID, date: override.date, status: override.status,
        windows: override.status === 'available' ? [[override.start, override.end]] : [],
        updatedAt: new Date().toISOString(), updatedBy: auth.currentUser.uid,
      });
      setNotice(override.status === 'available' ? `Special clinic hours saved for ${override.date}.` : `Clinic marked unavailable for ${override.date}.`);
    } catch { setNotice('Unable to save clinic availability.'); }
  };

  const saveStaffProfile = async (event) => {
    event.preventDefault();
    const email = profile.email.trim().toLowerCase();
    if (!profile.name.trim() || !email || profile.password.length < 6) { setNotice('Enter a name, email, and temporary password of at least six characters.'); return; }
    try {
      await httpsCallable(functions, 'manageStaffAccount')({ action: 'provision', email, displayName: profile.name.trim(), role: profile.role, password: profile.password });
      setProfile({ name: '', email: '', role: 'receptionist', password: '' });
      setNotice('Staff account created with its assigned role. Share the temporary password securely.');
    } catch (error) { setNotice(error?.code === 'functions/unavailable' ? 'Secure account management needs the Firebase Functions service deployed. This project must be upgraded to Blaze before it can be enabled.' : error?.message || 'Unable to create the staff account.'); }
  };
  const changeStaffAccess = async (member, action) => { const password = action === 'temporaryPassword' ? window.prompt(`Set a new temporary password for ${member.email} (minimum 6 characters):`) : ''; if (action === 'temporaryPassword' && !password) return; try { await httpsCallable(functions, 'manageStaffAccount')({ action, email: member.email, password, disabled: action === 'disable' ? member.active !== false : undefined }); setNotice(action === 'disable' ? 'Staff account status updated.' : 'Temporary password updated.'); } catch (error) { setNotice(error?.code === 'functions/unavailable' ? 'Secure account management needs Firebase Functions on the Blaze plan before it can be enabled.' : error?.message || 'Unable to update staff access.'); } };

  if (state === 'signed-out') return <Navigate to="/login" replace />;
  if (state === 'denied') return <main className="staff-shell"><section className="workspace-gate"><p>SOOD CLINIC STAFF</p><h1>Administrator access required</h1><span>Your account is signed in, but it is not assigned the <code>admin</code> role. A project administrator must grant that role with the trusted Firebase Admin command.</span><button type="button" className="staff-secondary-button" onClick={() => signOut(auth)}>Sign out</button></section></main>;
  if (state === 'checking') return <main className="staff-shell"><p className="workspace-status">Verifying secure administrator access…</p></main>;

  return <main className="staff-shell">
    <header className="staff-topbar">
      <div><Link to="/" className="staff-wordmark">SOOD CLINIC</Link><span>Staff / Admin</span></div>
      <nav><Link to="/staff/admin" className="is-active">Overview</Link><Link to="/staff/account">My account</Link><Link to="/">View public site</Link><button type="button" onClick={() => signOut(auth)}>Sign out</button></nav>
    </header>
    <div className="staff-admin">
      <header className="staff-admin__heading"><div><p className="section-kicker">Clinic operations</p><h1>{greeting()}, {auth.currentUser?.displayName || 'Administrator'}</h1><span>Monitor appointments, manage clinic availability, and maintain the internal staff directory.</span></div><div className="staff-admin__identity"><strong>{auth.currentUser?.displayName || 'Administrator'}</strong><span>Clinic administrator</span></div></header>
      <section className="admin-metrics" aria-label="Appointment overview"><article><span>Scheduled</span><strong>{summary.scheduled}</strong><small>Awaiting consultation</small></article><article><span>Completed</span><strong>{summary.completed}</strong><small>Closed consultations</small></article><article><span>Cancelled</span><strong>{summary.cancelled}</strong><small>Slots returned to calendar</small></article><article><span>Directory</span><strong>{staff.length}</strong><small>Internal staff records</small></article></section>
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      <section className="admin-grid">
        <section className="admin-panel admin-panel--appointments"><div className="admin-panel__head"><div><p className="section-kicker">Appointment desk</p><h2>Consultation queue</h2></div><select aria-label="Filter appointments" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="scheduled">Scheduled</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="all">All appointments</option></select></div><div className="admin-appointment-list">{visibleAppointments.length ? visibleAppointments.map((appointment) => <article key={appointment.id} className="admin-appointment"><div><strong>{appointment.patient?.name || 'Patient'}</strong><span>{formatDateTime(appointment.startsAt)}</span><small>{appointment.patient?.phone || 'No phone recorded'} · {appointment.reason || 'No reason supplied'}</small></div><div><span className={`appointment-status appointment-status--${appointment.status}`}>{appointment.status}</span>{appointment.status === 'scheduled' && <div className="admin-appointment__actions"><button type="button" onClick={() => updateAppointment(appointment, 'completed')}>Complete</button><button type="button" className="button-danger" onClick={() => updateAppointment(appointment, 'cancelled')}>Cancel</button></div>}</div></article>) : <p className="empty-state">No {filter === 'all' ? '' : filter} appointments.</p>}</div></section>
        <form className="admin-panel admin-form" onSubmit={saveOverride}><div><p className="section-kicker">Calendar authority</p><h2>Exceptional availability</h2><span>Regular Monday–Saturday hours remain active. Use this only for closures, Sunday clinics, or overtime.</span></div><label>Date<input type="date" value={override.date} min={dateKey()} onChange={(event) => setOverride({ ...override, date: event.target.value })} required /></label><label>Day status<select value={override.status} onChange={(event) => setOverride({ ...override, status: event.target.value })}><option value="available">Open special hours</option><option value="unavailable">Mark unavailable</option></select></label>{override.status === 'available' && <div className="admin-time-pair"><label>From<input type="time" value={override.start} onChange={(event) => setOverride({ ...override, start: event.target.value })} required /></label><label>To<input type="time" value={override.end} onChange={(event) => setOverride({ ...override, end: event.target.value })} required /></label></div>}<button type="submit">Save availability</button></form>
        <form className="admin-panel admin-form" onSubmit={saveStaffProfile}><div><p className="section-kicker">Staff accounts</p><h2>Create a team account</h2><span>Creates the Firebase account and assigns its secure role from the trusted server service.</span></div><label>Full name<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} placeholder="Team member name" required /></label><label>Work email<input type="email" value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} placeholder="name@example.com" required /></label><label>Temporary password<input type="password" value={profile.password} onChange={(event) => setProfile({ ...profile, password: event.target.value })} minLength="6" required /></label><label>Workspace role<select value={profile.role} onChange={(event) => setProfile({ ...profile, role: event.target.value })}><option value="admin">Administrator</option><option value="doctor">Doctor</option><option value="receptionist">Reception</option></select></label><button type="submit">Create staff account</button></form>
        <section className="admin-panel admin-panel--directory"><div className="admin-panel__head"><div><p className="section-kicker">Team</p><h2>Staff directory</h2></div></div>{staff.length ? <ul className="staff-directory">{staff.map((member) => <li key={member.id}><div><strong>{member.name}</strong><span>{member.email}</span></div><div className="staff-directory__actions"><span>{member.role}</span><button type="button" onClick={() => changeStaffAccess(member, 'temporaryPassword')}>Reset password</button><button type="button" onClick={() => changeStaffAccess(member, 'disable')}>{member.active === false ? 'Enable' : 'Disable'}</button></div></li>)}</ul> : <p className="empty-state">No internal staff records yet.</p>}<p className="admin-panel__footnote">Administrative account actions run through a server-side Firebase Admin function. Never assign roles from browser storage or client-side data.</p></section>
      </section>
    </div>
  </main>;
};

export default StaffAdmin;
