import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import StaffLayout from '../components/StaffLayout';
import { useStaffAccess } from '../lib/staffSessionContext';
import { istDateKey } from '../lib/ist';
import { formatDateTime, patientName, patientPhone } from '../lib/time';
import { listStaffAppointments } from '../services/appointmentService';

const ReceptionWorkspace = () => {
  const { state } = useStaffAccess('receptionist');
  const [dateKey, setDateKey] = useState(istDateKey());
  const [appointments, setAppointments] = useState([]);
  const [status, setStatus] = useState('Loading appointments…');

  useEffect(() => {
    if (state !== 'allowed') return undefined;
    let active = true;
    setStatus('Loading appointments…');
    listStaffAppointments(dateKey)
      .then(result => { if (active) { setAppointments(result.appointments || []); setStatus(''); } })
      .catch(error => { if (active) { setAppointments([]); setStatus(error.message || 'Appointments could not be loaded.'); } });
    return () => { active = false; };
  }, [dateKey, state]);

  if (state === 'signed-out') return <Navigate to="/staff/login" replace />;
  if (state === 'password-change') return <Navigate to="/staff/account" replace />;
  if (state !== 'allowed') return <main className="staff-shell"><p className="workspace-status">Verifying staff access…</p></main>;

  return <StaffLayout>
    <div className="staff-admin">
      <header className="staff-admin__heading"><div><p className="section-kicker">Reception desk</p><h1>Today’s appointments</h1><span>Operational details only; clinical notes remain private. New public booking requests are reviewed in <Link to="/staff/requests">Requests</Link>.</span></div></header>
      <section className="admin-panel admin-panel--appointments manager-queue">
        <div className="manager-queue__date"><label>Clinic date<input type="date" value={dateKey} onChange={event => setDateKey(event.target.value)} /></label></div>
        <div className="admin-appointment-list">{appointments.length ? appointments.map(appointment => <article className="admin-appointment" key={appointment.id}><div><strong>{patientName(appointment)}</strong><span>{formatDateTime(appointment.startsAt)}</span><small>{patientPhone(appointment)} · {appointment.visitMode === 'video' ? 'Online video consultation' : 'Clinic consultation'}</small></div><span className={`appointment-status appointment-status--${appointment.status}`}>{appointment.status}</span></article>) : <p className="empty-state" role="status">{status || `No appointments are booked for ${dateKey}.`}</p>}</div>
      </section>
    </div>
  </StaffLayout>;
};

export default ReceptionWorkspace;
