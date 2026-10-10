import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { Link, Navigate } from 'react-router-dom';
import NotificationMenu from '../components/NotificationMenu';
import { auth, functions } from '../lib/firebase';
import { toDate } from '../lib/time';

const formatWhen = (value) => {
  const date = toDate(value);
  return date ? date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }) : 'Time unavailable';
};

const VideoConsultations = () => {
  const [user, setUser] = useState(undefined);
  const [role, setRole] = useState('');
  const [appointments, setAppointments] = useState([]);
  const [links, setLinks] = useState({});
  const [busyId, setBusyId] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try { const result = await httpsCallable(functions, 'getVideoConsultationQueue')(); setAppointments(result.data.appointments || []); }
    catch (caught) { setError(caught?.message || 'Online consultations could not be loaded.'); }
  }, []);

  useEffect(() => onAuthStateChanged(auth, async (next) => {
    if (!next) { setUser(null); return; }
    const token = await next.getIdTokenResult();
    if (token.claims.forcePasswordChange) { setRole('password-change'); setUser(next); return; }
    setRole(token.claims.role || ''); setUser(next);
  }), []);
  useEffect(() => { if (user && role && role !== 'password-change') load(); }, [user, role, load]);

  const save = async (appointment) => {
    setBusyId(appointment.id); setError(''); setNotice('');
    try {
      const result = await httpsCallable(functions, 'setVideoConsultationAccess')({ appointmentId: appointment.id, joinUrl: links[appointment.id] || '' });
      setNotice(result.data.message || 'Video access updated.'); await load();
    } catch (caught) { setError(caught?.message || 'Video access could not be updated.'); } finally { setBusyId(''); }
  };
  if (user === undefined) return <main className="staff-shell"><p className="workspace-status">Verifying staff access…</p></main>;
  if (!user) return <Navigate to="/staff/login" replace />;
  if (role === 'password-change') return <Navigate to="/staff/account" replace />;
  if (!['admin', 'doctor', 'receptionist'].includes(role)) return <main className="staff-shell"><section className="workspace-gate"><p>SOOD CLINIC STAFF</p><h1>Staff access required</h1><button type="button" onClick={() => signOut(auth)}>Sign out</button></section></main>;
  const primaryHref = role === 'admin' ? '/staff/admin' : role === 'doctor' ? '/staff/doctor' : '/staff/reception';
  return <main className="staff-shell"><header className="staff-topbar"><Link to={primaryHref} className="staff-wordmark">SOOD CLINIC</Link><nav><Link to={primaryHref}>Workspace</Link><Link to="/staff/video" className="is-active">Video visits</Link>{role === 'admin' && <Link to="/staff/admin/visit-types">Visit formats</Link>}<NotificationMenu /><Link to="/staff/account">My account</Link><button type="button" onClick={() => signOut(auth)}>Sign out</button></nav></header><div className="staff-admin video-consultations"><header className="staff-admin__heading"><div><p className="section-kicker">Online care</p><h1>Video consultations</h1><span>Prepare each patient’s secure joining link. The clinic chooses its own video provider; no meeting link is generated or shared automatically.</span></div><button type="button" className="staff-secondary-button" onClick={load}>Refresh</button></header>{notice && <p className="admin-notice" role="status">{notice}</p>}{error && <p className="staff-login__error" role="alert">{error}</p>}<section className="admin-panel video-consultations__list"><div className="admin-panel__head"><div><p className="section-kicker">Next 31 days</p><h2>Online appointments</h2></div><span>{appointments.length}</span></div>{appointments.length ? <div className="admin-appointment-list">{appointments.map((appointment) => { const ready = appointment.videoConsultation?.status === 'ready'; const value = links[appointment.id] ?? (ready ? appointment.videoConsultation.joinUrl || '' : ''); return <article className="video-appointment" key={appointment.id}><div className="video-appointment__summary"><strong>{appointment.patient?.name || 'Patient'}</strong><span>{formatWhen(appointment.startsAt)}</span><small>{appointment.patient?.phone || 'No phone recorded'} · {appointment.reference || 'Reference pending'}</small><em className={ready ? 'video-status video-status--ready' : 'video-status'}>{ready ? 'Joining link ready' : 'Link pending'}</em></div><div className="video-appointment__access"><label>Secure video meeting link<input type="url" inputMode="url" placeholder="https://…" value={value} onChange={(event) => setLinks({ ...links, [appointment.id]: event.target.value })} /></label><div><button type="button" disabled={busyId === appointment.id} onClick={() => save(appointment)}>{busyId === appointment.id ? 'Saving…' : value ? 'Save secure link' : 'Clear link'}</button>{ready && <a href={appointment.videoConsultation.joinUrl} target="_blank" rel="noreferrer">Open meeting</a>}</div></div></article>; })}</div> : <div className="patient-empty-state"><strong>No upcoming online consultations</strong><span>Online bookings will appear here once patients select an available video appointment format.</span></div>}</section></div></main>;
};

export default VideoConsultations;
