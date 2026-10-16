import { useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { Link, Navigate } from 'react-router-dom';
import { auth, firestore } from '../lib/firebase';
import { addIstDays, istDateKey } from '../lib/ist';
import { formatDateTime, patientName, patientPhone } from '../lib/time';
import { allowedAppointmentTransitions, appointmentActionLabel } from '../lib/appointmentState';
import { transitionAppointment } from '../services/appointmentService';
import { getDoctorPatientSummary } from '../services/schedulerService';
import ConfirmDialog from '../components/ConfirmDialog';

const DoctorWorkspace = () => {
  const [state, setState] = useState('checking');
  const [doctorId, setDoctorId] = useState('');
  const [dateKey, setDateKey] = useState(istDateKey());
  const [appointments, setAppointments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [summary, setSummary] = useState(null);
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) return setState('signed-out');
    const token = await user.getIdTokenResult();
    if (token.claims.forcePasswordChange) return setState('password-change');
    if (token.claims.role !== 'doctor' || !token.claims.doctorId) return setState('denied');
    setDoctorId(token.claims.doctorId);
    setState('allowed');
  }), []);

  useEffect(() => {
    if (state !== 'allowed' || !doctorId) return undefined;
    return onSnapshot(query(collection(firestore, 'appointments'), where('doctorId', '==', doctorId), where('dateKey', '==', dateKey), orderBy('startsAt', 'asc')), (snapshot) => {
      setAppointments(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    }, () => setNotice('Today’s patient list could not be loaded.'));
  }, [state, doctorId, dateKey]);

  const updateStatus = async (appointment, status, reason = '') => {
    try { await transitionAppointment(appointment.id, status, reason); setNotice(`Appointment marked ${status.replace('_', ' ')}.`); }
    catch (error) { setNotice(error?.message || 'Unable to update this appointment.'); }
  };
  const openSummary = async (appointment) => {
    setSelected(appointment);
    setSummary({ loading: true });
    try { setSummary(await getDoctorPatientSummary({ appointmentId: appointment.id })); }
    catch (error) { setSummary({ error: error?.message || 'Patient summary could not be loaded.' }); }
  };
  const chooseAction = (appointment, status) => {
    if (status !== 'cancelled') return updateStatus(appointment, status);
    setDialog({ title: 'Cancel appointment', message: 'A cancellation reason is required.', confirmLabel: 'Cancel appointment', requireReason: true, onConfirm: (reason) => updateStatus(appointment, status, reason) });
  };
  const moveDay = (amount) => setDateKey((current) => addIstDays(current, amount));

  if (state === 'signed-out') return <Navigate to="/staff/login" replace />;
  if (state === 'password-change') return <Navigate to="/staff/account" replace />;
  if (state === 'denied') return <main className="staff-shell"><section className="workspace-gate"><p>SOOD CLINIC STAFF</p><h1>Doctor access required</h1><button type="button" className="staff-secondary-button" onClick={() => signOut(auth)}>Sign out</button></section></main>;
  if (state !== 'allowed') return <main className="staff-shell"><p className="workspace-status">Verifying secure doctor access…</p></main>;

  return <><main className="staff-shell"><header className="staff-topbar"><Link to="/" className="staff-wordmark">SOOD CLINIC</Link><nav><Link to="/staff/doctor" className="is-active">Today</Link><Link to="/staff/calendar">Calendar</Link><Link to="/staff/doctor/schedule">Schedule</Link><Link to="/staff/account">My account</Link><button type="button" onClick={() => signOut(auth)}>Sign out</button></nav></header><div className="staff-admin"><header className="staff-admin__heading"><div><p className="section-kicker">Doctor desk</p><h1>Today’s patient list</h1><span>Work through the queue using server-authorised appointment actions.</span></div><div className="staff-admin__identity"><strong>{appointments.filter((item) => !['cancelled', 'completed', 'no_show'].includes(item.status)).length} active</strong><span>{dateKey}</span></div></header>{notice && <p className="admin-notice" role="status">{notice}</p>}<section className="admin-panel admin-panel--appointments"><div className="manager-queue__date"><button type="button" onClick={() => moveDay(-1)}>← Previous</button><label>Clinic date<input type="date" value={dateKey} onChange={(event) => setDateKey(event.target.value)} /></label><button type="button" onClick={() => setDateKey(istDateKey())}>Today</button><button type="button" onClick={() => moveDay(1)}>Next →</button></div><div className="admin-appointment-list">{appointments.length ? appointments.map((appointment) => { const actions = allowedAppointmentTransitions(appointment.status, 'doctor'); return <article className="admin-appointment" key={appointment.id}><div><strong>{appointment.queueToken ? `Queue ${appointment.queueToken} · ` : ''}{patientName(appointment)}</strong><span>{formatDateTime(appointment.startsAt)}</span><small>{patientPhone(appointment)} · {appointment.reason || 'Consultation'}</small></div><div><span className={`appointment-status appointment-status--${appointment.status}`}>{appointment.status}</span><button type="button" className="staff-secondary-button" onClick={() => openSummary(appointment)}>Patient summary</button>{actions.length > 0 && <div className="admin-appointment__actions">{actions.map((status) => <button key={status} type="button" className={status === 'cancelled' ? 'button-danger' : ''} onClick={() => chooseAction(appointment, status)}>{appointmentActionLabel(status)}</button>)}</div>}</div></article>; }) : <p className="empty-state">No appointments for {dateKey}.</p>}</div></section></div></main>{selected && <section className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Patient summary"><div className="modal-card"><button type="button" onClick={() => { setSelected(null); setSummary(null); }}>Close</button>{summary?.loading && <p>Loading patient summary…</p>}{summary?.error && <p role="alert">{summary.error}</p>}{summary?.profile && <><h2>{summary.profile.title ? `${summary.profile.title} ` : ''}{summary.profile.displayName || patientName(selected)}</h2><p>{summary.profile.uhid || 'Clinic ID not assigned'} · {summary.profile.phone || patientPhone(selected)}</p><p>{summary.profile.gender || 'Gender not recorded'} · {summary.profile.dateOfBirth || 'Date of birth not recorded'}</p><h3>Past visits</h3>{summary.history?.length ? <ul>{summary.history.map((visit) => <li key={visit.id}>{visit.dateKey || 'Date unavailable'} · {visit.status} · {visit.visitKind || 'consultation'}{visit.reason ? ` · ${visit.reason}` : ''}</li>)}</ul> : <p>No past visits are recorded.</p>}</>}</div></section>}<ConfirmDialog open={Boolean(dialog)} title={dialog?.title || ''} message={dialog?.message || ''} confirmLabel={dialog?.confirmLabel || 'Confirm'} requireReason={dialog?.requireReason} onCancel={() => setDialog(null)} onConfirm={(reason) => { const action = dialog?.onConfirm; setDialog(null); action?.(reason); }} /></>;
};

export default DoctorWorkspace;
