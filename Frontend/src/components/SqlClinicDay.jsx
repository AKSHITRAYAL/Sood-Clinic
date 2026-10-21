import { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { sqlClinicDayService } from '../services/sqlClinicDayService';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const time = value => new Date(value).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
function ClinicDay({ role, assignedDoctorId, api }) {
  const [doctorId, setDoctorId] = useState(assignedDoctorId || ''); const [date, setDate] = useState(today);
  const [page, setPage] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const alive = useRef(false); const running = useRef(false); const positions = useRef(new Set());
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = async more => {
    if (running.current || (more && !page?.nextCursor)) return;
    const selected = more ? { doctorId: page.doctorId, date: page.date } : { doctorId, date };
    const position = more ? page.nextCursor : null; const key = JSON.stringify(position);
    if (more && positions.current.has(key)) { setError('The day changed. Reload before continuing.'); return; }
    running.current = true; setBusy(true); setError('');
    if (!more) { setPage(null); positions.current.clear(); }
    try {
      const result = await api.list(selected.doctorId, selected.date, position);
      if (!alive.current) return;
      if (more) {
        positions.current.add(key);
        setPage(previous => ({ ...result, appointments: [...previous.appointments, ...result.appointments.filter(row => !previous.appointments.some(old => old.id === row.id))] }));
      } else setPage(result);
    } catch (caught) {
      if (alive.current) {
        setError('Clinic day is unavailable. Check current staff access and the exact doctor/date, then reload.');
        if (['functions/permission-denied', 'functions/unauthenticated'].includes(caught?.code)) setPage(null);
      }
    } finally { if (alive.current) { running.current = false; setBusy(false); } }
  };
  return <section className="admin-panel"><h1>Clinic day</h1><p>Times are in IST. Read-only operational view; refresh after booking or rescheduling changes.</p>
    <form onSubmit={event => { event.preventDefault(); load(false); }}><fieldset disabled={busy}><legend>Select a clinic day</legend>
      <label>Doctor ID<input required autoComplete="off" maxLength={80} value={doctorId} readOnly={role === 'doctor'} onChange={event => setDoctorId(event.target.value)} /></label>
      <label>Clinic date (IST)<input required type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <button type="submit" disabled={busy || !doctorId || !date}>{busy ? 'Loading…' : 'Load / refresh day'}</button>
    </fieldset></form>
    {error && <p role="alert" className="staff-login__error">{error}</p>}{busy && <p role="status">Loading clinic day…</p>}
    {page && <><h2>{page.doctorName} · {page.date}</h2>{!page.appointments.length && <p>No appointments are recorded for this doctor/day. This does not mean the day is open for booking.</p>}
      <div className="admin-table-wrap"><table><caption>Operational appointments (IST)</caption><thead><tr><th scope="col">Time</th><th scope="col">Reference</th><th scope="col">Format / branch</th><th scope="col">Status</th></tr></thead><tbody>{page.appointments.map(row => <tr key={row.id}>
        <td>{time(row.startsAt)}–{time(row.endsAt)}</td><td>{row.reference}</td><td>{row.serviceName} · {row.visitMode === 'video' ? 'Video' : 'In person'}<br />{row.branchName}</td><td>{row.status.replaceAll('_', ' ')}</td>
      </tr>)}</tbody></table></div>{page.nextCursor && <button type="button" disabled={busy} onClick={() => load(true)}>Load later appointments</button>}</>}
    <p>Patient identities, health information, guest contacts and meeting links are not included. This view does not change appointment or queue state.</p>
  </section>;
}
ClinicDay.propTypes = { role: PropTypes.string.isRequired, assignedDoctorId: PropTypes.string, api: PropTypes.object.isRequired };
// Staged only; do not replace current staff routes before the coordinated release.
export default function SqlClinicDay({ accountUid, role, assignedDoctorId, api = sqlClinicDayService }) {
  if (!accountUid || !['admin', 'manager', 'doctor'].includes(role) || (role === 'doctor' && !assignedDoctorId)) return <p role="alert">Current staff access is required.</p>;
  return <ClinicDay key={`${accountUid}:${role}:${assignedDoctorId || ''}`} role={role} assignedDoctorId={assignedDoctorId} api={api} />;
SqlClinicDay.propTypes = { accountUid: PropTypes.string.isRequired, role: PropTypes.string.isRequired, assignedDoctorId: PropTypes.string, api: PropTypes.object };
