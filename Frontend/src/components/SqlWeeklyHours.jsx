import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { sqlWeeklyHoursService } from '../services/sqlWeeklyHoursService';
import ConfirmDialog from './ConfirmDialog';

const minutesToClock = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const clockToMinutes = value => {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes <= 1439 ? minutes : null;
};
const weekdayLabel = d => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][d - 1] || `Day ${d}`;
const newRequestId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : '00000000-0000-4000-8000-000000000000');
const failClosed = ['functions/permission-denied', 'functions/unauthenticated'];
const inputErrors = [...failClosed, 'functions/invalid-argument'];

function WeeklyHours({ sessions, editing, saving, onChange }) {
  return <fieldset disabled={saving}><legend>Weekly sessions (IST)</legend>
    {!sessions.length && <p>No regular sessions are recorded for this doctor. This is not the same as closed permanently.</p>}
    <ul>{sessions.map((session, index) => <li key={`${session.weekday}-${index}`}>
      <label>{weekdayLabel(session.weekday)}</label>
      <input type="time" aria-label="Start" step="300" value={minutesToClock(session.startMinute)} disabled={!editing} onChange={event => {
        const minutes = clockToMinutes(event.target.value);
        if (minutes !== null) onChange(index, 'startMinute', minutes);
      }} />–<input type="time" aria-label="End" step="300" value={minutesToClock(session.endMinute)} disabled={!editing} onChange={event => {
        const minutes = clockToMinutes(event.target.value);
        if (minutes !== null) onChange(index, 'endMinute', minutes);
      }} />
    </li>)}</ul>
  </fieldset>;
}
WeeklyHours.propTypes = {
  sessions: PropTypes.array.isRequired,
  editing: PropTypes.bool.isRequired,
  saving: PropTypes.bool.isRequired,
  onChange: PropTypes.func.isRequired,
};

function WeeklyHoursEditor({ role, assignedDoctorId, api }) {
  const [doctorId, setDoctorId] = useState(assignedDoctorId || '');
  const [record, setRecord] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [editing, setEditing] = useState(false); const [saveBusy, setSaveBusy] = useState(false);
  const [blocked, setBlocked] = useState(false); const [reloadAsk, setReloadAsk] = useState(false);
  const alive = useRef(false); const running = useRef(false); const requestId = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = async () => {
    if (running.current) return;
    running.current = true; setBusy(true); setError(''); setEditing(false); setBlocked(false); setReloadAsk(false);
    try {
      const row = await api.get(doctorId);
      if (!alive.current) return;
      setRecord(row); setSessions(row.sessions); requestId.current = newRequestId();
    } catch {
      if (!alive.current) return;
      setRecord(null); setSessions([]);
      setError('Weekly hours are unavailable. Revert to the current staff schedule and try again.');
    } finally { running.current = false; if (alive.current) setBusy(false); }
  };
  const save = async () => {
    if (saveBusy || !record) return;
    setSaveBusy(true); setError('');
    try {
      await api.save({ doctorId: record.doctorId, expectedUpdatedAt: record.updatedAt, sessions, requestId: requestId.current });
      if (!alive.current) return;
      setRecord(previous => ({ ...previous, sessions }));
      setEditing(false); setBlocked(true);
    } catch (caught) {
      if (!alive.current) return;
      if (failClosed.includes(caught?.code)) {
        setRecord(null); setSessions([]); setEditing(false);
        setError('Weekly hours are unavailable. Revert to the current staff schedule and try again.');
      } else if (inputErrors.includes(caught?.code)) {
        setError(caught?.message || 'Check weekdays and start/end times.');
        if (caught?.code === 'functions/invalid-argument') requestId.current = newRequestId();
      } else {
        setError('Save could not be confirmed. Reload the current server record before editing again.');
        setReloadAsk(true);
      }
    } finally { if (alive.current) setSaveBusy(false); }
  };
  const askReload = event => {
    event.preventDefault();
    if (busy) return;
    if (editing || blocked) setReloadAsk(true); else load();
  };
  const change = (index, key, value) => setSessions(current => current.map((session, position) => position === index ? { ...session, [key]: value } : session));

  return <section className="admin-panel"><h1>Regular clinic hours</h1>
    <p>Times are in IST. No fallback clinic hours are invented; an empty record means the clinic has no verified weekly schedule for this doctor.</p>
    {error && <p role="alert" className="staff-login__error">{error}</p>}{busy && <p role="status">Loading weekly hours…</p>}
    <form onSubmit={askReload}><fieldset disabled={busy || saveBusy}><legend>Select doctor</legend>
      <label>Doctor ID<input required autoComplete="off" maxLength={80} value={doctorId} readOnly={role === 'doctor'} onChange={event => setDoctorId(event.target.value)} /></label>
      <button type="submit" disabled={busy || saveBusy || !doctorId}>{busy ? 'Loading…' : 'Load / reload hours'}</button>
    </fieldset></form>
    {record && <><h2>{record.doctorName}</h2><p>Last verified {new Date(record.updatedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST.</p>
      <WeeklyHours sessions={sessions} editing={editing} saving={saveBusy || busy} onChange={change} />
      {editing
        ? <button type="button" disabled={saveBusy} onClick={save}>{saveBusy ? 'Saving…' : 'Save weekly hours'}</button>
        : <button type="button" disabled={busy || saveBusy || blocked} onClick={() => { setEditing(true); setError(''); }}>Edit weekly hours</button>}
      {blocked && !editing && <p role="status">Saved. Reload the record before editing again so the next save uses the current revision.</p>}</>}
    <ConfirmDialog open={reloadAsk} title="Reload weekly hours?" message="You have unsaved or unconfirmed changes. Reload the current server record and discard your edits?" confirmLabel="Reload" onConfirm={() => { setReloadAsk(false); load(); }} onCancel={() => setReloadAsk(false)} />
  </section>;
}
WeeklyHoursEditor.propTypes = { role: PropTypes.string.isRequired, assignedDoctorId: PropTypes.string, api: PropTypes.object.isRequired };

// Staged only; do not replace current staff routes before the coordinated release.
export default function SqlWeeklyHours({ accountUid, role, assignedDoctorId, api = sqlWeeklyHoursService }) {
  if (!accountUid || !['admin', 'doctor'].includes(role) || (role === 'doctor' && !assignedDoctorId)) return <p role="alert">Current administrator or assigned doctor access is required.</p>;
  return <WeeklyHoursEditor key={`${accountUid}:${role}:${assignedDoctorId || ''}`} role={role} assignedDoctorId={assignedDoctorId} api={api} />;
}
SqlWeeklyHours.propTypes = { accountUid: PropTypes.string.isRequired, role: PropTypes.string.isRequired, assignedDoctorId: PropTypes.string, api: PropTypes.object };
