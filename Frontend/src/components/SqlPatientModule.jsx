import { useEffect, useRef, useState } from 'react';

import PropTypes from 'prop-types';
import SqlPatientWorkspace from './SqlPatientWorkspace';
import { sqlPatientAccountService } from '../services/sqlPatientAccountService';
import SqlPatientSecurity from './SqlPatientSecurity';

function AccountSetup({ accountUid, api, onReady }) {
  const [account, setAccount] = useState(null); const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState(''); const [busy, setBusy] = useState(true); const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState(''); const [revision, setRevision] = useState(0); const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let current = true; setBusy(true); setLoaded(false); setError(''); setUncertain(false); setName(''); onReady(false);
    api.get(accountUid).then(row => { if (current) { setAccount(row); setLoaded(true); onReady(Boolean(row)); } })
      .catch(() => { if (current) { setAccount(null); setError('Account status is unavailable. Verify your email and sign in again, or ask the clinic to check your account.'); } })
      .finally(() => { if (current) setBusy(false); });
    return () => { current = false; };
  }, [accountUid, api, revision, onReady]);
  const initialize = async event => {
    event.preventDefault(); if (busy || uncertain || account || !loaded) return;
    setBusy(true); setError('');
    try {
      const row = await api.initialize(accountUid, name, crypto.randomUUID());
      if (alive.current) { setAccount(row); onReady(true); }
    } catch {
      if (alive.current) { setUncertain(true); setError('Initialization could not be confirmed. It may already have completed. Reload account status before submitting again.'); }
    } finally { if (alive.current) setBusy(false); }
  };
  return <section className="patient-page-card"><h2>Verified portal account</h2>
    {busy && <p role="status">Checking your SQL account…</p>}{error && <p role="alert" className="staff-login__error">{error}</p>}
    {account && <><p>Account ready: {account.displayName}</p><label>Your account ID (for clinic verification)<input readOnly autoComplete="off" value={accountUid} /></label><p>Sharing this ID is not proof of identity. The clinic verifies patient links separately.</p></>}
    {loaded && !account && <form onSubmit={initialize}><p>Set up your account label. This does not register a patient, match contact details, allocate a clinic ID or grant access to records.</p><label>Account name<input required minLength={2} maxLength={160} autoComplete="name" value={name} disabled={busy || uncertain} onChange={event => setName(event.target.value)} /></label><button type="submit" disabled={busy || uncertain || name.trim().length < 2}>Initialize account</button></form>}
    {!account && <button type="button" className="staff-secondary-button" disabled={busy} onClick={() => setRevision(value => value + 1)}>Reload account status (discard edited name)</button>}
  </section>;
}
AccountSetup.propTypes = { accountUid: PropTypes.string.isRequired, api: PropTypes.object.isRequired, onReady: PropTypes.func.isRequired };

function PatientModule({ accountUid, accountApi, patientApi, securityApi }) {
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const [securityBusy, setSecurityBusy] = useState(false);
  return <><AccountSetup accountUid={accountUid} api={accountApi} onReady={setReady} />{ready && <><fieldset disabled={securityBusy} aria-label="Patient records" style={{ border: 0, padding: 0, minWidth: 0 }}><SqlPatientWorkspace accountUid={accountUid} api={patientApi} onEditingChange={setEditing} /></fieldset>{editing
    ? <p>Save or explicitly discard your patient-record edits before changing account security.</p>
    : <SqlPatientSecurity accountUid={accountUid} api={securityApi} onBusyChange={setSecurityBusy} />}</>}</>;
}
PatientModule.propTypes = { accountUid: PropTypes.string.isRequired, accountApi: PropTypes.object.isRequired, patientApi: PropTypes.object, securityApi: PropTypes.object };

// Staged composition only: do not mount instead of the live portal until release gates pass.
export default function SqlPatientModule({ accountUid, accountApi = sqlPatientAccountService, patientApi, securityApi }) {
  if (!accountUid) return <p role="alert">Sign in with a verified patient account.</p>;
  return <PatientModule key={accountUid} accountUid={accountUid} accountApi={accountApi} patientApi={patientApi} securityApi={securityApi} />;
}
SqlPatientModule.propTypes = { accountUid: PropTypes.string.isRequired, accountApi: PropTypes.object, patientApi: PropTypes.object, securityApi: PropTypes.object };
