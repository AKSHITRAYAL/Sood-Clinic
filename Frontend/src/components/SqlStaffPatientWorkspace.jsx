import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { PatientForm } from './SqlPatientWorkspace';
import ConfirmDialog from './ConfirmDialog';
import { sqlStaffPatientService } from '../services/sqlStaffPatientService';
import SqlPatientLinkManager from './SqlPatientLinkManager';

function Registry({ accountUid, role, api, linkApi }) {
  const [kind, setKind] = useState('uhid'); const [term, setTerm] = useState('');
  const [patients, setPatients] = useState([]); const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false); const [saving, setSaving] = useState(false); const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(''); const [searched, setSearched] = useState(false); const [action, setAction] = useState(null);
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const navigate = next => { if (saving || busy) return; if (dirty) setAction(() => next); else next(); };
  const search = async (searchKind, value) => {
    setBusy(true); setError(''); setSelected(''); setPatients([]); setSearched(false); setDirty(false);
    try {
      const matches = await api.search(searchKind, value);
      if (alive.current) { setPatients(matches); setSearched(true); }
    } catch (caught) {
      if (alive.current) setError(['functions/permission-denied', 'functions/unauthenticated'].includes(caught?.code)
        ? 'Current administrator or manager access is required. Sign in again.'
        : 'Patient search could not be completed. Check the exact clinic ID or phone and retry.');
    } finally { if (alive.current) setBusy(false); }
  };
  return <div className="admin-patients"><header><h1>Patient registry</h1><p>Search by exact clinic ID or phone. Health data and account permissions are managed separately.</p></header>
    {error && <p role="alert" className="staff-login__error">{error}</p>}
    <section className="admin-panel"><form onSubmit={event => { event.preventDefault(); if (term.trim()) navigate(() => search(kind, term.trim())); }}>
      <label>Search by<select value={kind} disabled={busy || saving} onChange={event => setKind(event.target.value)}><option value="uhid">Exact clinic ID</option><option value="phone">Phone number</option></select></label>
      <label>{kind === 'uhid' ? 'Clinic ID (case-sensitive)' : 'Phone number, including country code'}<input value={term} maxLength={64} required disabled={busy || saving} autoComplete="off" onChange={event => setTerm(event.target.value)} /></label>
      <button type="submit" disabled={busy || saving || !term.trim()}>{busy ? 'Searching…' : 'Search patients'}</button>
    </form><p>No name-prefix searches, full patient-directory downloads or contact-based account linking.</p></section>
    <div className="admin-patients__grid"><section className="admin-panel patient-results"><h2>Matches</h2>
      {busy && <p role="status">Loading matches…</p>}{searched && !patients.length && <p>No matching active patient records.</p>}
      <ul>{patients.map(patient => <li key={patient.patientId}><div><strong>{patient.displayName}</strong><span>{patient.uhid}</span><small>{patient.phone}</small></div><button type="button" disabled={busy || saving || selected === patient.patientId} onClick={() => navigate(() => { setSelected(patient.patientId); setDirty(false); })}>Open details</button></li>)}</ul>
    </section><section className="admin-panel patient-editor">{selected
      ? <><PatientForm key={`${accountUid}:${selected}`} patientId={selected} kind="profile" api={api} onDirtyChange={setDirty} onBusyChange={setSaving} />
        {!dirty && !saving ? <SqlPatientLinkManager accountUid={accountUid} role={role} patientId={selected} api={linkApi} /> : <p>Save or discard profile edits before managing patient-account links.</p>}</>
      : <p>Select a search result to edit demographic details. This does not create a login or patient link.</p>}</section></div>
    <ConfirmDialog open={Boolean(action)} title="Discard these edits?" message="Unsaved edits will be discarded. A previous unconfirmed save may already have completed; reload the record before editing again." confirmLabel="Discard edits" onCancel={() => setAction(null)} onConfirm={() => { const next = action; setAction(null); setDirty(false); next?.(); }} />
  </div>;
}
Registry.propTypes = { accountUid: PropTypes.string.isRequired, role: PropTypes.string.isRequired, api: PropTypes.object.isRequired, linkApi: PropTypes.object };

// Not mounted in current staff routes; server Auth remains the permission authority.
export default function SqlStaffPatientWorkspace({ accountUid, role, api = sqlStaffPatientService, linkApi }) {
  if (!accountUid || !['admin', 'manager'].includes(role)) return <p role="alert">Current administrator or manager access is required.</p>;
  return <Registry key={`${accountUid}:${role}`} accountUid={accountUid} role={role} api={api} linkApi={linkApi} />;
}
SqlStaffPatientWorkspace.propTypes = { accountUid: PropTypes.string.isRequired, role: PropTypes.string.isRequired, api: PropTypes.object, linkApi: PropTypes.object };
