import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { Link, Navigate } from 'react-router-dom';
import NotificationMenu from '../components/NotificationMenu';
import { auth, firestore } from '../lib/firebase';

const formatWhen = (value) => new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

const PatientPortal = () => {
  const [user, setUser] = useState(undefined); const [profile, setProfile] = useState({}); const [appointments, setAppointments] = useState([]); const [documents, setDocuments] = useState([]); const [notice, setNotice] = useState('');
  useEffect(() => onAuthStateChanged(auth, (next) => setUser(next || null)), []);
  useEffect(() => {
    if (!user) return undefined;
    const patientRef = doc(firestore, 'patients', user.uid);
    const unavailable = () => setNotice('We could not load your care information. Please refresh or contact the clinic.');
    const stopProfile = onSnapshot(patientRef, (snapshot) => setProfile(snapshot.exists() ? snapshot.data() : {}), unavailable);
    const stopDocuments = onSnapshot(query(collection(patientRef, 'medicalDocuments'), orderBy('createdAt', 'desc')), (snapshot) => setDocuments(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), unavailable);
    const stopAppointments = onSnapshot(query(collection(firestore, 'appointments'), where('patientId', '==', user.uid)), (snapshot) => setAppointments(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)))), unavailable);
    return () => { stopProfile(); stopDocuments(); stopAppointments(); };
  }, [user]);
  if (user === undefined) return <main className="patient-portal"><p className="workspace-status">Loading your care information…</p></main>;
  if (!user) return <Navigate to="/login" replace />;
  const upcoming = appointments.filter((item) => ['scheduled', 'confirmed'].includes(item.status) && new Date(item.startsAt) >= new Date());
  const notifications = upcoming.length ? [`You have ${upcoming.length} upcoming appointment${upcoming.length === 1 ? '' : 's'}.`] : [];
  const name = profile.displayName || user.displayName || 'Patient';
  return <main className="patient-portal"><header className="patient-topbar"><Link to="/">SOOD CLINIC</Link><nav><NotificationMenu items={notifications} /><Link to="/patient/account">Edit profile</Link><Link className="patient-topbar__book" to="/Booknow">Book appointment</Link><button type="button" onClick={() => signOut(auth)}>Sign out</button></nav></header><div className="patient-dashboard"><header className="patient-dashboard__heading"><h1>Your care</h1><span>Appointments, documents and important updates from Sood Clinic.</span></header>{notice && <p className="admin-notice" role="status">{notice}</p>}<section className="patient-priority"><div><p className="section-kicker">Next appointment</p>{upcoming.length ? <><h2>{formatWhen(upcoming[0].startsAt)}</h2><span>Dr. Brig. A. K. Sood VSM (Retd)</span></> : <><h2>No upcoming appointment</h2><span>Choose a convenient time when you are ready.</span></>}</div><Link to="/Booknow">Book appointment</Link></section><section className="patient-grid patient-grid--read-only"><section className="admin-panel patient-appointments"><div className="admin-panel__head"><div><p className="section-kicker">Appointments</p><h2>Your upcoming visits</h2></div></div>{upcoming.length ? <div className="admin-appointment-list">{upcoming.map((appointment) => <article key={appointment.id} className="admin-appointment"><div><strong>{formatWhen(appointment.startsAt)}</strong><small>Dr. Brig. A. K. Sood VSM (Retd)</small></div><span className={`appointment-status appointment-status--${appointment.status}`}>{appointment.status}</span></article>)}</div> : <p className="empty-state">There are no upcoming visits.</p>}</section><section className="admin-panel"><div className="admin-panel__head"><div><p className="section-kicker">Documents</p><h2>From the clinic</h2></div></div>{documents.length ? <ul className="health-record-list">{documents.map((entry) => <li key={entry.id}><strong>{entry.title} <em>{entry.category}</em></strong><span>{entry.details || 'Shared by Sood Clinic'}</span></li>)}</ul> : <p className="empty-state">Documents shared by the clinic will appear here.</p>}</section><section className="admin-panel patient-appointments"><div className="admin-panel__head"><div><p className="section-kicker">Past care</p><h2>Appointment history</h2></div></div>{appointments.filter((item) => !['scheduled', 'confirmed'].includes(item.status) || new Date(item.startsAt) < new Date()).length ? <div className="admin-appointment-list">{appointments.filter((item) => !['scheduled', 'confirmed'].includes(item.status) || new Date(item.startsAt) < new Date()).map((appointment) => <article key={appointment.id} className="admin-appointment"><div><strong>{formatWhen(appointment.startsAt)}</strong><small>Dr. Brig. A. K. Sood VSM (Retd)</small></div><span className={`appointment-status appointment-status--${appointment.status}`}>{appointment.status}</span></article>)}</div> : <p className="empty-state">Your completed visits will appear here.</p>}</section><section className="admin-panel"><p className="section-kicker">Profile</p><h2>{name}</h2><span>Your details are kept in one place and can be changed from Edit profile.</span><Link className="patient-profile__link" to="/patient/account">Edit profile</Link></section></section></div></main>;
};
export default PatientPortal;
