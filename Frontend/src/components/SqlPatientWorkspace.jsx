import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import ConfirmDialog from './ConfirmDialog';
import { sqlPatientService } from '../services/sqlPatientService';

const personalFields = [
  ['title', 'Title', ['Mr.', 'Mrs.', 'Ms.', 'Dr.']], ['displayName', 'Full name'], ['phone', 'Phone (+country code)'],
  ['dateOfBirth', 'Date of birth', 'date'], ['gender', 'Gender', ['Female', 'Male', 'Non-binary', 'Prefer to self-describe']],
  ['maritalStatus', 'Marital status', ['Single', 'Married', 'Widowed', 'Divorced']], ['addressLine1', 'Address'],
  ['city', 'City'], ['state', 'State'], ['postalCode', 'Postal code'], ['emergencyContactName', 'Emergency contact'], ['emergencyContactPhone', 'Emergency phone (+country code)'],
];
const healthFields = [['bloodGroup', 'Blood group (self-reported)', ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']], ['allergies', 'Allergies', 'text'], ['currentMedications', 'Current medications', 'text'], ['healthNotes', 'Notes for your care team', 'text']];
const errorText = error => ['functions/permission-denied', 'functions/unauthenticated'].includes(error?.code)
  ? 'Access is unavailable. Sign in again or ask the clinic to review your patient link.'
  : error?.code === 'functions/invalid-argument'
    ? 'Check the entered details, including country codes and dates, then save again.'
  : ['functions/aborted', 'functions/already-exists'].includes(error?.code)
    ? 'These details changed or this request was already used. Reload the latest record before editing.'
    : 'The request could not be confirmed. Retry unchanged details or reload the latest record.';
const when = value => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
const ignoreEditing = () => {};

export function PatientForm({ patientId, kind, api, onDirtyChange, onBusyChange }) {
  const [record, setRecord] = useState(null); const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false); const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0); const [confirm, setConfirm] = useState(false);
  const [edited, setEdited] = useState(false);
  const pending = useRef(null); const alive = useRef(false);
  const fields = kind === 'health' ? healthFields : personalFields;
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!edited && !busy && !blocked) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [edited, busy, blocked]);
  useEffect(() => {
    let current = true;
    setRecord(null); setForm({}); setError(''); setBlocked(false); setEdited(false); pending.current = null; onDirtyChange(false);
    const read = kind === 'health' ? api.getHealth : api.getProfile;
    read(patientId).then(data => {
      if (!current) return;
      setRecord(data);
      setForm(Object.fromEntries(fields.map(([key]) => [key, (kind === 'health' ? data.profile[key] : data[key]) ?? ''])));
    }).catch(caught => { if (current) setError(errorText(caught)); });
    return () => { current = false; };
  }, [patientId, kind, api, reload, fields, onDirtyChange]);
  const change = (key, value) => { setForm({ ...form, [key]: value }); setEdited(true); onDirtyChange(true); };
  const save = async event => {
    event.preventDefault(); if (!record || busy || (blocked && !pending.current)) return;
    if (!pending.current) pending.current = { patientId, profile: { ...form }, expectedUpdatedAt: record.updatedAt, requestId: crypto.randomUUID() };
    setBusy(true); onBusyChange(true); setError(''); setNotice('');
    try {
      await (kind === 'health' ? api.saveHealth : api.saveProfile)(pending.current);
      if (!alive.current) return;
      pending.current = null; setEdited(false); onDirtyChange(false); setBlocked(false); setNotice('Saved. Loading the latest record…'); setReload(value => value + 1);
    } catch (caught) {
      if (!alive.current) return;
      setError(errorText(caught)); setBlocked(true);
      // Server input validation occurs before any write. Other failures remain uncertain.
      if (caught?.code === 'functions/invalid-argument') { pending.current = null; setBlocked(false); }
      if (['functions/aborted', 'functions/already-exists', 'functions/permission-denied', 'functions/unauthenticated'].includes(caught?.code)) pending.current = null;
      if (['functions/permission-denied', 'functions/unauthenticated'].includes(caught?.code)) { setRecord(null); setForm({}); }
    } finally { if (alive.current) { setBusy(false); onBusyChange(false); } }
  };
  return <section className="patient-page-card">
    <h2>{kind === 'health' ? 'Information you choose to share' : 'Personal details'}</h2>
    {kind === 'health' && <p>Self-reported information, not a diagnosis or verified laboratory result.</p>}
    {error && <p role="alert" className="staff-login__error">{error}</p>}{notice && <p role="status" className="admin-notice">{notice}</p>}
    {!record && !error && <p role="status">Loading patient details…</p>}
    {record && <form onSubmit={save} className="patient-form">
      <fieldset disabled={busy || blocked}><legend>{kind === 'health' ? 'Health profile' : `Clinic ID: ${record.uhid}`}</legend><div className="patient-form__grid">
        {fields.map(([key, label, type]) => <label key={key}>{label}{Array.isArray(type)
          ? <select value={form[key] ?? ''} onChange={event => change(key, event.target.value)}><option value="">Not specified</option>{type.map(value => <option key={value}>{value}</option>)}</select>
          : type === 'text' ? <textarea value={form[key] ?? ''} maxLength={2000} rows={4} onChange={event => change(key, event.target.value)} />
            : <input type={type || 'text'} value={form[key] ?? ''} required={['displayName', 'phone'].includes(key)} maxLength={key === 'addressLine1' ? 500 : key === 'phone' || key === 'emergencyContactPhone' ? 16 : 160} onChange={event => change(key, event.target.value)} />}</label>)}
      </div></fieldset>
      <button type="submit" disabled={busy || (blocked && !pending.current)}>{busy ? 'Saving…' : blocked ? 'Retry unchanged save' : 'Save details'}</button>
    </form>}
    <button type="button" disabled={busy} className="staff-secondary-button" onClick={() => setConfirm(true)}>Reload latest details</button>
    <ConfirmDialog open={confirm} title="Reload patient details?" message="Unsaved edits will be discarded. An earlier save may already have completed; check the reloaded record before editing again." confirmLabel="Reload latest" onCancel={() => setConfirm(false)} onConfirm={() => { setConfirm(false); onDirtyChange(false); setNotice(''); setReload(value => value + 1); }} />
  </section>;
}
PatientForm.propTypes = { patientId: PropTypes.string.isRequired, kind: PropTypes.oneOf(['profile', 'health']).isRequired, api: PropTypes.object.isRequired, onDirtyChange: PropTypes.func.isRequired, onBusyChange: PropTypes.func.isRequired };

function AppointmentHistory({ patientId, api }) {
  const [rows, setRows] = useState([]); const [cursor, setCursor] = useState(null);
  const [busy, setBusy] = useState(true); const [error, setError] = useState(''); const [revision, setRevision] = useState(0);
  const alive = useRef(false); const cursors = useRef(new Set()); const loading = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let current = true; setRows([]); setCursor(null); setBusy(true); setError(''); cursors.current.clear(); loading.current = true;
    api.appointments(patientId).then(page => { if (current) { setRows(page.appointments); setCursor(page.nextCursor); } })
      .catch(caught => { if (current) setError(errorText(caught)); }).finally(() => { if (current) { setBusy(false); loading.current = false; } });
    return () => { current = false; };
  }, [patientId, api, revision]);
  const more = async () => {
    if (!cursor || loading.current) return;
    const key = JSON.stringify(cursor);
    if (cursors.current.has(key)) { setError('History changed. Refresh the list before continuing.'); return; }
    loading.current = true; setBusy(true); setError('');
    try {
      const page = await api.appointments(patientId, cursor); if (!alive.current) return;
      cursors.current.add(key);
      setRows(current => [...current, ...page.appointments.filter(row => !current.some(existing => existing.id === row.id))]);
      setCursor(page.nextCursor);
    } catch (caught) { if (alive.current) { setError(errorText(caught)); if (['functions/permission-denied', 'functions/unauthenticated'].includes(caught?.code)) { setRows([]); setCursor(null); } } }
    finally { if (alive.current) { loading.current = false; setBusy(false); } }
  };
  return <section className="patient-page-card"><h2>Appointments</h2><p>Times are in IST. Refresh after a reschedule. Online changes and secure video links require the coordinated scheduler release.</p>
    {error && <p role="alert" className="staff-login__error">{error}</p>}{busy && <p role="status">Loading visits…</p>}
    {!busy && !error && !rows.length && <p>No appointments found for this patient.</p>}
    <div className="patient-visit-list">{rows.map(row => <article key={row.id}><div><strong>{when(row.startsAt)}</strong><span>{row.doctorName} · {row.serviceName}</span><span>{row.branchName} · {row.visitMode === 'video' ? 'Video consultation' : 'In-person consultation'}</span><small>{row.reference}</small></div><span>{row.status.replaceAll('_', ' ')}</span></article>)}</div>
    {cursor && <button type="button" disabled={busy} onClick={more}>Load older visits</button>}
    <button type="button" disabled={busy} className="staff-secondary-button" onClick={() => setRevision(value => value + 1)}>Refresh history</button>
  </section>;
}
AppointmentHistory.propTypes = { patientId: PropTypes.string.isRequired, api: PropTypes.object.isRequired };

// Prepared for the coordinated SQL cutover; deliberately not mounted in live routes.
function SqlPatientAccount({ accountUid, api, onEditingChange }) {
  const [patients, setPatients] = useState([]); const [selected, setSelected] = useState(''); const [tab, setTab] = useState('profile');
  const [code, setCode] = useState(''); const [busy, setBusy] = useState(true); const [error, setError] = useState(''); const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false); const [saving, setSaving] = useState(false); const [navigation, setNavigation] = useState(null);
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => { onEditingChange(dirty || saving); }, [dirty, saving, onEditingChange]);
  useEffect(() => {
    let current = true; setPatients([]); setSelected(''); setCode(''); setError(''); setBusy(true);
    api.listPatients().then(rows => { if (current) { setPatients(rows); setSelected(rows[0]?.patientId ?? ''); } })
      .catch(caught => { if (current) setError(errorText(caught)); }).finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [accountUid, api, revision]);
  const link = async event => {
    event.preventDefault(); if (busy || dirty || saving) return;
    const value = code.trim(); setCode(''); setError(''); setBusy(true);
    try { await api.acceptLink(value); if (alive.current) setRevision(value => value + 1); }
    catch (caught) { if (alive.current) setError(errorText(caught)); }
    finally { if (alive.current) setBusy(false); }
  };
  const patient = patients.find(row => row.patientId === selected);
  const navigate = action => { if (saving || busy) return; if (dirty) setNavigation(() => action); else action(); };
  return <div className="patient-dashboard"><header><h1>Your clinic records</h1><p>Patient records are linked by clinic verification, not matching phone or email.</p></header>
    {error && <p role="alert" className="staff-login__error">{error}</p>}{busy && <p role="status">Loading patient access…</p>}
    {!!patients.length && <label>Select patient<select value={selected} disabled={busy || saving} onChange={event => { const id = event.target.value; navigate(() => { setSelected(id); setTab('profile'); }); }}>
      {patients.map(row => <option key={row.patientId} value={row.patientId}>{row.displayName} · {row.uhid}{row.relationship === 'guardian' ? ' (guardian access)' : ''}</option>)}
    </select></label>}
    {!busy && !error && !patients.length && <p>No verified patient link is available. Ask the clinic to verify your identity before sharing a code.</p>}
    {patient && !busy && <section key={`${accountUid}:${patient.patientId}`}><nav aria-label="Patient record sections">
      <button type="button" disabled={saving} aria-pressed={tab === 'profile'} onClick={() => { if (tab !== 'profile') navigate(() => setTab('profile')); }}>Personal details</button>
      <button type="button" aria-pressed={tab === 'health'} disabled={saving || patient.relationship !== 'self'} onClick={() => { if (tab !== 'health') navigate(() => setTab('health')); }}>Health profile</button>
      <button type="button" disabled={saving} aria-pressed={tab === 'appointments'} onClick={() => { if (tab !== 'appointments') navigate(() => setTab('appointments')); }}>Appointments</button>
    </nav>{patient.relationship === 'guardian' && <p>Guardian clinical access is not enabled. Ask the clinic about its consent process.</p>}
      {tab === 'appointments' ? <AppointmentHistory key={`${accountUid}:${selected}:appointments`} patientId={selected} api={api} />
        : <PatientForm key={`${accountUid}:${selected}:${tab}`} patientId={selected} kind={tab} api={api} onDirtyChange={setDirty} onBusyChange={setSaving} />}
    </section>}
    <section className="patient-page-card"><h2>Link a clinic-verified patient</h2><p>Use only the code given by the clinic. It expires after ten minutes. Codes are not saved in browser storage or URLs.</p>
      {dirty && <p>Save or discard your record edits before linking another patient.</p>}
      <form onSubmit={link}><label>Clinic-issued code<input type="password" autoComplete="off" spellCheck={false} value={code} maxLength={43} disabled={busy || saving || dirty} onChange={event => setCode(event.target.value)} /></label><button type="submit" disabled={busy || saving || dirty || !/^[A-Za-z0-9_-]{43}$/.test(code.trim())}>Confirm link</button></form>
      <button type="button" disabled={busy || saving} className="staff-secondary-button" onClick={() => navigate(() => setRevision(value => value + 1))}>Reload patient access</button>
    </section>
    <ConfirmDialog open={Boolean(navigation)} title="Discard these edits?" message="Unsaved edits will be discarded. An earlier unconfirmed save may already have completed; reload before making further changes." confirmLabel="Discard edits" onCancel={() => setNavigation(null)} onConfirm={() => { const action = navigation; setNavigation(null); setDirty(false); action?.(); }} />
  </div>;
}
SqlPatientAccount.propTypes = { accountUid: PropTypes.string.isRequired, api: PropTypes.object.isRequired, onEditingChange: PropTypes.func.isRequired };
export default function SqlPatientWorkspace({ accountUid, api = sqlPatientService, onEditingChange = ignoreEditing }) {
  if (!accountUid) return <p role="alert">Sign in to access patient records.</p>;
  return <SqlPatientAccount key={accountUid} accountUid={accountUid} api={api} onEditingChange={onEditingChange} />;
}
SqlPatientWorkspace.propTypes = { accountUid: PropTypes.string.isRequired, api: PropTypes.object, onEditingChange: PropTypes.func };
