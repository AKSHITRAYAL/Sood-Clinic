import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { EmailAuthProvider, onAuthStateChanged, reauthenticateWithCredential, sendPasswordResetEmail, signOut, updatePassword, updateProfile } from 'firebase/auth';
import { collection, doc, onSnapshot, orderBy, query, setDoc, where } from 'firebase/firestore';
import { Link, Navigate, NavLink } from 'react-router-dom';
import NotificationMenu from '../components/NotificationMenu';
import PatientAvatar from '../components/PatientAvatar';
import SoodClinicMark from '../components/SoodClinicMark';
import { auth, firestore } from '../lib/firebase';

const formatWhen = (value) => new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
const isUpcoming = (item) => ['scheduled', 'confirmed'].includes(item.status) && new Date(item.startsAt) >= new Date();
const blankProfile = () => ({ title: '', displayName: '', phone: '', dateOfBirth: '', gender: '', maritalStatus: '', bloodGroup: '', addressLine1: '', city: '', state: '', postalCode: '', emergencyContactName: '', emergencyContactPhone: '', allergies: '', currentMedications: '', healthNotes: '' });

const PortalIcon = ({ name }) => {
  const content = {
    overview: <><rect x="3.5" y="3.5" width="7" height="7" rx="1" /><rect x="13.5" y="3.5" width="7" height="7" rx="1" /><rect x="3.5" y="13.5" width="7" height="7" rx="1" /><rect x="13.5" y="13.5" width="7" height="7" rx="1" /></>,
    appointments: <><rect x="4" y="5.5" width="16" height="14" rx="2" /><path d="M8 3.5v4M16 3.5v4M4 10h16" /></>,
    documents: <><path d="M7 3.5h7l4 4v13H7a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2Z" /><path d="M14 3.5v5h5M8.5 13h7M8.5 16.5h5" /></>,
    health: <path d="M12 20.5S4.5 16.1 4.5 9.6A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7.5 1.6c0 6.5-7.5 10.9-7.5 10.9Z" />,
    profile: <><circle cx="12" cy="8" r="3.25" /><path d="M5.5 20c.65-3.4 2.75-5.1 6.5-5.1s5.85 1.7 6.5 5.1" /></>,
    security: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2.5" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true">{content[name]}</svg>;
};
PortalIcon.propTypes = { name: PropTypes.string.isRequired };

const PatientPortal = ({ view }) => {
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState({});
  const [form, setForm] = useState(blankProfile());
  const [appointments, setAppointments] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [portalMenuOpen, setPortalMenuOpen] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (next) => setUser(next || null)), []);
  useEffect(() => {
    if (!portalMenuOpen) return undefined;
    const closeOnEscape = (event) => { if (event.key === 'Escape') setPortalMenuOpen(false); };
    document.addEventListener('keydown', closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [portalMenuOpen]);
  useEffect(() => {
    if (!user) return undefined;
    const patientRef = doc(firestore, 'patients', user.uid);
    const failed = () => setError('We could not load part of your care information. Please refresh or contact the clinic.');
    const stopProfile = onSnapshot(patientRef, (snapshot) => {
      const data = snapshot.exists() ? snapshot.data() : {};
      setProfile(data);
      setForm({ ...blankProfile(), ...data, displayName: data.displayName || user.displayName || '' });
    }, failed);
    const stopDocuments = onSnapshot(query(collection(patientRef, 'medicalDocuments'), orderBy('createdAt', 'desc')), (snapshot) => setDocuments(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))), failed);
    const stopAppointments = onSnapshot(query(collection(firestore, 'appointments'), where('patientId', '==', user.uid)), (snapshot) => setAppointments(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)))), failed);
    return () => { stopProfile(); stopDocuments(); stopAppointments(); };
  }, [user]);

  const saveProfile = async (event) => {
    event.preventDefault(); setError(''); setNotice('');
    const displayName = form.displayName.trim();
    if (!displayName) { setError('Please enter your full name.'); return; }
    const now = new Date().toISOString();
    try {
      await updateProfile(user, { displayName: `${form.title ? `${form.title} ` : ''}${displayName}`.trim() });
      await setDoc(doc(firestore, 'patients', user.uid), { ...form, displayName, email: user.email || '', createdAt: profile.createdAt || now, updatedAt: now }, { merge: true });
      setNotice('Your profile has been saved.');
    } catch { setError('We could not save your profile. Please try again.'); }
  };

  const sendReset = async () => { setError(''); try { await sendPasswordResetEmail(auth, user.email); setNotice('A secure password-reset link was sent to your email.'); } catch { setError('We could not send a reset link. Please try again.'); } };
  const changePassword = async (event) => {
    event.preventDefault(); setError('');
    if (newPassword.length < 10) { setError('Use a password with at least 10 characters.'); return; }
    try { await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword)); await updatePassword(user, newPassword); setCurrentPassword(''); setNewPassword(''); setNotice('Your password has been changed.'); } catch { setError('Check your current password and try again.'); }
  };

  if (user === undefined) return <main className="patient-portal"><p className="workspace-status">Loading your care information…</p></main>;
  if (!user) return <Navigate to="/login" replace />;

  const name = profile.displayName || user.displayName || 'Patient';
  const upcoming = appointments.filter(isUpcoming);
  const past = appointments.filter((item) => !isUpcoming(item));
  const notifications = upcoming.length ? [`You have ${upcoming.length} upcoming appointment${upcoming.length === 1 ? '' : 's'}.`] : [];
  const navItems = [['overview', '/patient', 'Overview'], ['appointments', '/patient/appointments', 'Appointments'], ['documents', '/patient/documents', 'Documents'], ['health', '/patient/health', 'Health profile'], ['profile', '/patient/account', 'Personal details'], ['security', '/patient/security', 'Account & security']];
  const titles = { appointments: 'Appointments', documents: 'Documents', health: 'Health profile', profile: 'Personal details', security: 'Account & security' };

  const profileForm = <form className="patient-form" onSubmit={saveProfile}>
    <header><p className="section-kicker">Personal details</p><h2>Keep your clinic record current</h2><span>Only use details you are comfortable sharing with Sood Clinic.</span></header>
    <div className="patient-form__grid"><label>Title<select value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}><option value="">No title</option><option>Mr.</option><option>Mrs.</option><option>Ms.</option><option>Dr.</option></select></label><label>Full name<input value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} autoComplete="name" required /></label><label>Email address<input value={user.email || ''} disabled /></label><label>Phone number<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} autoComplete="tel" inputMode="tel" /></label><label>Date of birth<input type="date" value={form.dateOfBirth} onChange={(event) => setForm({ ...form, dateOfBirth: event.target.value })} /></label><label>Gender<select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}><option value="">Prefer not to say</option><option>Female</option><option>Male</option><option>Non-binary</option><option>Prefer to self-describe</option></select></label><label>Marital status<select value={form.maritalStatus} onChange={(event) => setForm({ ...form, maritalStatus: event.target.value })}><option value="">Prefer not to say</option><option>Single</option><option>Married</option><option>Widowed</option><option>Divorced</option></select></label><label>Blood group<select value={form.bloodGroup} onChange={(event) => setForm({ ...form, bloodGroup: event.target.value })}><option value="">Not specified</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((item) => <option key={item}>{item}</option>)}</select></label></div>
    <fieldset><legend>Address</legend><div className="patient-form__grid"><label className="patient-form__wide">Address line<input value={form.addressLine1} onChange={(event) => setForm({ ...form, addressLine1: event.target.value })} autoComplete="street-address" /></label><label>City<input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} autoComplete="address-level2" /></label><label>State<input value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} autoComplete="address-level1" /></label><label>Postal code<input value={form.postalCode} onChange={(event) => setForm({ ...form, postalCode: event.target.value })} autoComplete="postal-code" inputMode="numeric" /></label></div></fieldset>
    <fieldset><legend>Emergency contact</legend><div className="patient-form__grid"><label>Contact name<input value={form.emergencyContactName} onChange={(event) => setForm({ ...form, emergencyContactName: event.target.value })} /></label><label>Contact phone<input value={form.emergencyContactPhone} onChange={(event) => setForm({ ...form, emergencyContactPhone: event.target.value })} inputMode="tel" /></label></div></fieldset><button type="submit">Save personal details</button>
  </form>;
  const healthForm = <form className="patient-form" onSubmit={saveProfile}><header><p className="section-kicker">Health profile</p><h2>Information you choose to share</h2><span>This is self-reported information, not a clinical diagnosis. Clinic staff may use it to prepare for your visit.</span></header><div className="patient-form__stack"><label>Allergies<textarea value={form.allergies} onChange={(event) => setForm({ ...form, allergies: event.target.value })} placeholder="For example, food, medicine, or other allergies" /></label><label>Current medications<textarea value={form.currentMedications} onChange={(event) => setForm({ ...form, currentMedications: event.target.value })} placeholder="Include medication name and dose if known" /></label><label>Notes for your care team<textarea value={form.healthNotes} onChange={(event) => setForm({ ...form, healthNotes: event.target.value })} placeholder="Anything you would like the clinic to know before your visit" /></label></div><button type="submit">Save health profile</button></form>;
  const list = (items) => items.length ? <div className="patient-visit-list">{items.map((item) => <article key={item.id}><div className="patient-visit-list__date"><strong>{new Date(item.startsAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</strong><span>{new Date(item.startsAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</span></div><div><strong>Consultation with Dr. A. K. Sood</strong><span>{item.reason || 'Clinic consultation'}</span></div><span className={`appointment-status appointment-status--${item.status}`}>{item.status}</span></article>)}</div> : <div className="patient-empty-state"><strong>No appointments yet</strong><span>When you book a visit, it will appear here.</span><Link to="/Booknow">Book appointment</Link></div>;

  let content;
  if (view === 'appointments') content = <section className="patient-page-card"><header className="patient-card__head"><div><p className="section-kicker">Appointments</p><h2>All visits</h2></div><Link to="/Booknow">Book appointment</Link></header>{list(appointments)}</section>;
  else if (view === 'documents') content = <section className="patient-page-card"><header className="patient-card__head"><div><p className="section-kicker">Documents</p><h2>From the clinic</h2></div><span>{documents.length}</span></header>{documents.length ? <ul className="health-record-list health-record-list--full">{documents.map((entry) => <li key={entry.id}><strong>{entry.title} <em>{entry.category}</em></strong><span>{entry.details || 'Shared by Sood Clinic'}</span></li>)}</ul> : <div className="patient-empty-state"><strong>No documents yet</strong><span>Reports, prescriptions and other files shared by authorised clinic staff will appear here.</span></div>}</section>;
  else if (view === 'health') content = healthForm;
  else if (view === 'profile') content = profileForm;
  else if (view === 'security') content = <section className="patient-security"><form className="patient-form" onSubmit={changePassword}><header><p className="section-kicker">Password</p><h2>Change password</h2><span>Confirm your current password before setting a new one.</span></header><div className="patient-form__stack"><label>Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required /></label><label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength="10" required /></label></div><button type="submit">Change password</button></form><section className="patient-page-card patient-security__reset"><p className="section-kicker">Reset by email</p><h2>Forgot your password?</h2><span>Send a time-limited reset link to {user.email}.</span><button type="button" onClick={sendReset}>Email reset link</button></section></section>;
  else content = <><section className="patient-profile-hero"><article className="patient-profile-identity"><PatientAvatar name={name} photoUrl={user.photoURL} className="patient-avatar--large" /><div><p>Patient profile</p><h2>{name}</h2><span>{user.email}</span></div><Link to="/patient/account">Edit profile</Link></article><dl className="patient-profile-facts"><div><dt>Phone</dt><dd>{profile.phone || 'Not added'}</dd></div><div><dt>Date of birth</dt><dd>{profile.dateOfBirth || 'Not added'}</dd></div><div><dt>Blood group</dt><dd>{profile.bloodGroup || 'Not specified'}</dd></div><div><dt>Member since</dt><dd>{profile.createdAt ? new Date(profile.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : 'Recently joined'}</dd></div></dl></section><section className="patient-care-grid"><section className="patient-care-card patient-care-card--appointments"><div className="patient-card__head"><div><p className="section-kicker">Appointments</p><h2>Upcoming care</h2></div><Link to="/Booknow">Book new</Link></div>{list(upcoming)}</section><section className="patient-care-card"><div className="patient-card__head"><div><p className="section-kicker">Documents</p><h2>From the clinic</h2></div><Link to="/patient/documents">View all</Link></div>{documents.length ? <ul className="health-record-list">{documents.slice(0, 3).map((entry) => <li key={entry.id}><strong>{entry.title} <em>{entry.category}</em></strong><span>{entry.details || 'Shared by Sood Clinic'}</span></li>)}</ul> : <div className="patient-empty-state"><strong>No documents yet</strong><span>Clinic-shared documents will appear here.</span></div>}</section><section className="patient-care-card patient-care-card--history"><div className="patient-card__head"><div><p className="section-kicker">Care history</p><h2>Past appointments</h2></div><Link to="/patient/appointments">View all</Link></div>{past.length ? <div className="patient-history-list">{past.slice(0, 4).map((item) => <article key={item.id}><div><strong>{formatWhen(item.startsAt)}</strong><span>Dr. Brig. A. K. Sood VSM (Retd)</span></div><span className={`appointment-status appointment-status--${item.status}`}>{item.status}</span></article>)}</div> : <p className="empty-state">Completed visits will appear here.</p>}</section></section></>;

  const closePortalMenu = () => setPortalMenuOpen(false);
  return <main className={`patient-portal${portalMenuOpen ? ' patient-portal--menu-open' : ''}`}><button type="button" className="patient-sidebar__backdrop" aria-label="Close patient navigation" onClick={closePortalMenu} /><aside className={`patient-sidebar${portalMenuOpen ? ' patient-sidebar--open' : ''}`} aria-label="Patient portal navigation"><div className="patient-sidebar__mobile-head"><span>Menu</span><button type="button" onClick={closePortalMenu} aria-label="Close menu">×</button></div><Link to="/" className="patient-sidebar__brand" aria-label="Sood Clinic home" onClick={closePortalMenu}><SoodClinicMark /></Link><div className="patient-sidebar__person"><PatientAvatar name={name} photoUrl={user.photoURL} className="patient-avatar--large" /><strong>{name}</strong><span>Patient portal</span></div><nav>{navItems.map(([icon, href, label]) => <NavLink key={href} to={href} end={href === '/patient'} onClick={closePortalMenu} className={({ isActive }) => `patient-sidebar__link${isActive ? ' is-active' : ''}`}><PortalIcon name={icon} /><span>{label}</span></NavLink>)}</nav><Link className="patient-sidebar__book" to="/Booknow" onClick={closePortalMenu}>Book appointment</Link><div className="patient-sidebar__bottom"><a href="/" onClick={closePortalMenu}>Public website</a><button type="button" onClick={() => signOut(auth)}>Sign out</button></div></aside><div className="patient-portal__content"><header className="patient-portal__topbar"><Link to="/" className="patient-topbar__brand" aria-label="Sood Clinic home"><SoodClinicMark /></Link><div className="patient-topbar__label"><p>SOOD CLINIC</p><span>Patient portal</span></div><nav><NotificationMenu items={notifications} /><Link className="patient-topbar__book" to="/Booknow">Book appointment</Link><Link className="patient-topbar__identity" to="/patient/account" aria-label="My profile"><PatientAvatar name={name} photoUrl={user.photoURL} /><span><strong>{name}</strong><small>My profile</small></span></Link><button type="button" className="patient-portal__menu-button" onClick={() => setPortalMenuOpen(true)} aria-label="Open patient navigation" aria-expanded={portalMenuOpen}><span /><span /><span /></button></nav></header><div className="patient-dashboard patient-dashboard--profile"><header className="patient-dashboard__heading"><p>{view === 'overview' ? 'YOUR CARE' : 'PATIENT PORTAL'}</p><h1>{view === 'overview' ? `Welcome back, ${name.split(' ')[0]}.` : titles[view]}</h1>{view === 'overview' && <span>Appointments, clinic documents and the personal details you choose to share.</span>}</header>{notice && <p className="admin-notice" role="status">{notice}</p>}{error && <p className="staff-login__error" role="alert">{error}</p>}{content}</div></div></main>;
};

PatientPortal.propTypes = { view: PropTypes.oneOf(['overview', 'appointments', 'documents', 'health', 'profile', 'security']).isRequired };
export default PatientPortal;
