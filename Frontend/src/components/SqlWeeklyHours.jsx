import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { sqlWeeklyHoursService } from '../services/sqlWeeklyHoursService';
import ConfirmDialog from './ConfirmDialog';

const minutesToClock = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const weekdayLabel = d => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d - 1] || `Day ${d}`;
function WeeklyHours({ doctorId, record, dirty, saving, onSave, onReload, reloadConfirm }) {
  const rows = record?.sessions?.map(session => ({ weekday: session.weekday, start: minutesToClock(session.startMinute), end: minutesToClock(session.endMinute), key: `${session.weekday}-${session.startMinute}-${session.endMinute}` })) || [];
  return <fieldset disabled={saving}><ul>{rows.map(row => <li key={row.key}><label>{weekdayLabel(row.weekday)}</label><input type="time" label="Start" value={row.start} disabled readOnly />–<input type="time" label="End" value={row.end} disabled readOnly /><input type="hidden" name={`session-${row.weekday}`} value={JSON.stringify({ weekday: row.weekday, startMinute: rows.indexOf(row) })} /></li>)}</ul></fieldset>;
}
WeeklyHours.propTypes = { doctorId: PropTypes.string.isRequired, record: PropTypes.shape({ sessions: PropTypes.array }).isRequired, dirty: PropTypes.bool, saving: PropTypes.bool, onSave: PropTypes.func, onReload: PropTypes.func, reloadConfirm: PropTypes.bool };
// Staged only; do not replace current staff routes before the coordinated release.
export default function SqlWeeklyHours({ accountUid, role, assignedDoctorId, api = sqlWeeklyHoursService }) {
  if (!accountUid || !['admin', 'doctor'].includes(role) || (role === 'doctor' && !assignedDoctorId)) return <p role="alert">Current administrator or assigned doctor access is required.</p>;
  const [doctorId, setDoctorId] = useState(assignedDoctorId || ''); const [record, setRecord] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [editing, setEditing] = useState(false); const [saveBusy, setSaveBusy] = useState(false); const [reloadAsk, setReloadAsk] = useState(false); const alive = useRef(false); const requestId = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const load = async () => {
    if (busy) return;
    setBusy(true); setError(''); setEditing(false); setReloadAsk(false); requestId.current = crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000000';
    try {
      const row = await api.get(doctorId);
      if (!alive.current) return;
      setRecord(row); setEditing(false);
    } catch (caught) {
      setError('Weekly hours are unavailable. Revert to the current staff schedule and try again.');
      if (['functions/permission-denied', 'functions/unauthenticated'].includes(caught?.code)) setRecord(null);
    } finally { if (alive.current) { setBusy(false); } }
  };
  const save = async () => {
    if (saveBusy) return;
    setSaveBusy(true);
      const saved = await api.save({ doctorId, expectedUpdatedAt: record?.updatedAt, sessions: record?.sessions, requestId: requestId.current });
      setRecord(saved); setEditing(false); setReloadAsk(false); requestId.current = crypto.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000000';
      if (['functions/invalid-argument', 'functions/permission-denied', 'functions/unauthenticated'].includes(caught?.code)) {
        setError(caught?.message || 'Check weekdays and start/end times.');
      } else {
        setError('Save could not be confirmed.');
        setReloadAsk(true);
      }
    } finally { if (alive.current) { setSaveBusy(false); } }
  if (!record) return <section className="admin-panel"><h1>Regular clinic hours</h1>{error && <p role="alert" className="staff-login__error">{error}</p>}{busy && <p role="status">Loading weekly hours…</p>}<form onSubmit={event => { event.preventDefault(); load(); }}><fieldset disabled={busy}><legend>Select doctor</legend><label>Doctor ID<input required autoComplete="off" maxLength={80} value={doctorId} readOnly={role === 'doctor'} onChange={event => setDoctorId(event.target.value)} /></label><button type="submit" disabled={busy || !doctorId}>{busy ? 'Loading…' : 'Load / reload hours'}</button></fieldset></form></section>;
  return <section className="admin-panel"><h1>{record.doctorName}</h1><p>Times are in IST. Read-only operational view until the SQL weekly-hours cutover is released.</p>
    <WeeklyHours doctorId={doctorId} record={record} />
    {error && <p role="alert" className="staff-login__error">{error}</p>}
    {editing ? <button type="button" disabled={saveBusy} onClick={save}>{saveBusy ? 'Saving…' : 'Save weekly hours'}</button> : <button type="button" disabled={busy} onClick={() => { setEditing(true); setError(''); }}>Edit weekly hours</button>}
    {reloadAsk && <ConfirmDialog open={true} title="Reload weekly hours?" message="You have unsaved changes. Reload the current server record and discard your edits?" confirmLabel="Reload" requireReason={false} onConfirm={() => { load(); setReloadAsk(false); }} onCancel={() => setReloadAsk(false)} />}
  </section>;
SqlWeeklyHours.propTypes = { accountUid: PropTypes.string.isRequired, role: PropTypes.string.isRequired, assignedDoctorId: PropTypes.string, api: PropTypes.object };
