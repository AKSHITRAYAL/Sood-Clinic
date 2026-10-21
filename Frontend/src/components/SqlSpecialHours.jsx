import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import ConfirmDialog from './ConfirmDialog';
import { sqlSpecialHoursService } from '../services/sqlSpecialHoursService';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const time = value => value < 0 ? '' : `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const minute = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) : -1;
function SpecialHours({ role, assignedDoctorId, api }) {
  const [doctorId, setDoctorId] = useState(assignedDoctorId || ''); const [date, setDate] = useState(today);
  const [record, setRecord] = useState(null); const [kind, setKind] = useState(''); const [rows, setRows] = useState([]);
  const [dirty, setDirty] = useState(false); const [busy, setBusy] = useState(false); const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [confirm, setConfirm] = useState(false);
  const alive = useRef(false); const pending = useRef(null); const running = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!dirty && !blocked && !pending.current) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, blocked, busy]);
  const load = async () => {
    if (running.current) return;
    running.current = true; setBusy(true); setDirty(false); setBlocked(false); setRecord(null); setRows([]); setKind(''); setError(''); setNotice(''); pending.current = null;
    try {
      const result = await api.get(doctorId, date);
      if (alive.current) { setRecord(result); setKind(result.exception?.kind || ''); setRows(result.exception?.sessions.map(row => ({ ...row })) || []); }
    } catch { if (alive.current) setError('Special hours are unavailable. Check current access, the doctor/date and SQL schedule reconciliation.'); }
    finally { if (alive.current) { running.current = false; setBusy(false); } }
  };
  const edit = (index, field, value) => { setRows(current => current.map((row, position) => position === index ? { ...row, [field]: value } : row)); setDirty(true); };
  const save = async event => {
    event.preventDefault(); if (running.current || !record || record.exception?.kind === 'closed' || (blocked && !pending.current)) return;
    if (!pending.current) pending.current = { doctorId: record.doctorId, date: record.date, kind, sessions: rows.map(row => ({ ...row })), expectedUpdatedAt: record.updatedAt, requestId: crypto.randomUUID() };
    running.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await api.save(pending.current);
      if (!alive.current) return;
      if (result?.saved !== true) throw Error('Unconfirmed save');
      pending.current = null; setDirty(false); setBlocked(true); setNotice('Special hours saved. Reload the latest schedule before editing again.');
    } catch (caught) {
      if (!alive.current) return;
      if (caught?.code === 'functions/invalid-argument') { pending.current = null; setBlocked(false); setError('Choose a mode and one to four valid sessions; sessions cannot overlap.'); }
      else {
        setBlocked(true); setError('Save could not be confirmed. Retry unchanged details or explicitly reload before editing.');
        if (['functions/aborted', 'functions/already-exists', 'functions/permission-denied', 'functions/unauthenticated'].includes(caught?.code)) pending.current = null;
        if (['functions/permission-denied', 'functions/unauthenticated'].includes(caught?.code)) { setRecord(null); setRows([]); }
      }
    } finally { if (alive.current) { running.current = false; setBusy(false); } }
  };
  return <section className="admin-panel"><h1>Special clinic hours</h1><p>Times are in IST. These settings do not cancel, move or notify existing bookings.</p>
    <form onSubmit={event => { event.preventDefault(); if (dirty || blocked) setConfirm(true); else load(); }}><fieldset disabled={busy}><legend>Select doctor and date</legend>
      <label>Doctor ID<input required maxLength={80} autoComplete="off" value={doctorId} readOnly={role === 'doctor'} onChange={event => setDoctorId(event.target.value)} /></label>
      <label>Clinic date (IST)<input required type="date" value={date} onChange={event => setDate(event.target.value)} /></label><button type="submit" disabled={busy || !doctorId || !date}>Load / reload special hours</button>
    </fieldset></form>
    {error && <p role="alert" className="staff-login__error">{error}</p>}{notice && <p role="status" className="admin-notice">{notice}</p>}{busy && <p role="status">Working…</p>}
    {record && <><h2>{record.doctorName} · {record.date}</h2>{record.exception?.kind === 'closed'
      ? <p role="status">This day is closed. Use the appointment-impact workflow to close or reopen it; this editor cannot bypass that protection.</p>
      : <form onSubmit={save}><fieldset disabled={busy || blocked}><legend>Special sessions (one to four)</legend>
        {!record.exception && <p>No special-hours exception is recorded for this date. No hours have been assumed.</p>}
        <label>How these hours apply<select required value={kind} onChange={event => { setKind(event.target.value); setDirty(true); }}><option value="">Choose a mode</option><option value="extra">Add to regular hours</option><option value="replace">Replace regular hours for this date</option></select></label>
        {rows.map((row, index) => <div key={index} className="patient-form__grid"><label>Start<input required type="time" value={time(row.startMinute)} onChange={event => edit(index, 'startMinute', minute(event.target.value))} /></label>
          <label>End<input required type="time" value={time(row.endMinute)} onChange={event => edit(index, 'endMinute', minute(event.target.value))} /></label><button type="button" onClick={() => { setRows(current => current.filter((_, position) => position !== index)); setDirty(true); }}>Remove session {index + 1}</button></div>)}
        <button type="button" disabled={rows.length >= 4} onClick={() => { setRows(current => [...current, { startMinute: -1, endMinute: -1 }]); setDirty(true); }}>Add session</button>
      </fieldset><button type="submit" disabled={busy || !rows.length || (blocked && !pending.current)}>{blocked && pending.current ? 'Retry unchanged save' : 'Save special hours'}</button></form>}</>}
    <ConfirmDialog open={confirm} title="Reload special hours?" message="Unsaved edits will be discarded. An earlier unconfirmed save may already have completed; check the latest schedule before editing again." confirmLabel="Reload" onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); load(); }} />
  </section>;
}
SpecialHours.propTypes = { role: PropTypes.string.isRequired, assignedDoctorId: PropTypes.string, api: PropTypes.object.isRequired };
// Staged only: use with the coordinated SQL schedule/appointment release.
export default function SqlSpecialHours({ accountUid, role, assignedDoctorId, api = sqlSpecialHoursService }) {
  if (!accountUid || !['admin', 'doctor'].includes(role) || (role === 'doctor' && !assignedDoctorId)) return <p role="alert">Current administrator or assigned doctor access is required.</p>;
  return <SpecialHours key={`${accountUid}:${role}:${assignedDoctorId || ''}`} role={role} assignedDoctorId={assignedDoctorId} api={api} />;
}
SqlSpecialHours.propTypes = { accountUid: PropTypes.string.isRequired, role: PropTypes.string.isRequired, assignedDoctorId: PropTypes.string, api: PropTypes.object };
