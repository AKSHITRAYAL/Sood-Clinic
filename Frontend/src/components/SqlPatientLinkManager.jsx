import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import ConfirmDialog from './ConfirmDialog';
import { sqlPatientLinkService } from '../services/sqlPatientLinkService';

function LinkEditor({ patientId, api }) {
  const [target, setTarget] = useState(''); const [relationship, setRelationship] = useState('self');
  const [attested, setAttested] = useState(false); const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState(null); const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!issued) return undefined;
    const clearExpired = () => { if (Date.now() >= Date.parse(issued.expiresAt)) { setIssued(null); setNotice('This code expired. Verify the selected account before issuing another.'); } };
    const timeout = window.setTimeout(clearExpired, Math.max(0, Date.parse(issued.expiresAt) - Date.now()));
    window.addEventListener('focus', clearExpired);
    document.addEventListener('visibilitychange', clearExpired);
    return () => { window.clearTimeout(timeout); window.removeEventListener('focus', clearExpired); document.removeEventListener('visibilitychange', clearExpired); };
  }, [issued]);
  const targetValid = target.length > 0 && target.length <= 128 && !/\s/.test(target) && ![...target].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
  const issue = async () => {
    if (busy || !attested || !targetValid) return;
    setConfirm(null); setBusy(true); setError(''); setNotice(''); setIssued(null);
    try {
      const result = await api.issue(patientId, target, relationship, relationship === 'self' ? 'in_person_identity' : 'guardian_authority');
      if (!alive.current) return;
      const expiry = Date.parse(result.expiresAt);
      if (!Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 11 * 60000) throw Error('Invalid expiry');
      setIssued(result); setNotice('Display this code only to the selected, verified account holder. They must accept it while signed in.');
    } catch {
      if (alive.current) setError('Code issuance could not be confirmed. Do not reuse an older code. Check the patient/account selection before issuing a replacement.');
    } finally { if (alive.current) { setBusy(false); setAttested(false); } }
  };
  const revoke = async () => {
    if (busy || !targetValid) return;
    setConfirm(null); setBusy(true); setError(''); setNotice(''); setIssued(null);
    try { await api.revoke(patientId, target); if (alive.current) setNotice('The selected SQL patient link and pending code were removed. This does not disable the login or change legacy records.'); }
    catch { if (alive.current) setError('Link removal could not be confirmed. Check access before retrying; do not assume it was rolled back.'); }
    finally { if (alive.current) { setBusy(false); setAttested(false); } }
  };
  return <section className="patient-page-card"><h2>Verified patient-account linking</h2>
    <p>Confirm identity or guardian authority with the clinic first. Knowing a phone, email or account ID is not identity evidence. Guardian linking does not enable clinical access.</p>
    {error && <p role="alert" className="staff-login__error">{error}</p>}{notice && <p role="status" className="admin-notice">{notice}</p>}
    <fieldset disabled={busy}><legend>Selected patient: {patientId}</legend>
      <label>Exact Firebase Auth account ID<input autoComplete="off" maxLength={128} value={target} onChange={event => { setTarget(event.target.value); setAttested(false); setIssued(null); setError(''); setNotice(''); }} /></label>
      <label>Relationship<select value={relationship} onChange={event => { setRelationship(event.target.value); setAttested(false); setIssued(null); }}><option value="self">Patient’s own account</option><option value="guardian">Verified guardian account</option></select></label>
      <label><input type="checkbox" checked={attested} onChange={event => setAttested(event.target.checked)} /> {relationship === 'self' ? 'I verified this patient’s identity in person and the exact account above.' : 'I verified guardian authority and the exact account above through the clinic’s approved process.'}</label>
    </fieldset>
    <button type="button" disabled={busy || !targetValid || !attested} onClick={() => setConfirm('issue')}>Issue clinic code</button>
    <button type="button" className="staff-secondary-button" disabled={busy || !targetValid} onClick={() => setConfirm('revoke')}>Remove this SQL patient link</button>
    {issued && <div role="status"><label>One-time code (not stored)<input readOnly autoComplete="off" value={issued.code} aria-label="Clinic-issued one-time code" /></label><p>Expires {new Date(issued.expiresAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST. Do not put it in an email, log or URL.</p><button type="button" className="staff-secondary-button" onClick={() => setIssued(null)}>Hide code</button></div>}
    <ConfirmDialog open={Boolean(confirm)} title={confirm === 'revoke' ? 'Remove this patient-account link?' : 'Issue a new clinic code?'} message={confirm === 'revoke'
      ? 'This removes the selected account’s SQL access link and pending code for this patient only. It does not suspend the account or alter legacy access.'
      : 'This replaces any pending code for this exact patient/account pair. The account holder must accept the new code; issuance alone does not grant access.'}
    confirmLabel={confirm === 'revoke' ? 'Remove link' : 'Issue new code'} onCancel={() => setConfirm(null)} onConfirm={confirm === 'revoke' ? revoke : issue} />
  </section>;
}
LinkEditor.propTypes = { patientId: PropTypes.string.isRequired, api: PropTypes.object.isRequired };

export default function SqlPatientLinkManager({ accountUid, role, patientId, api = sqlPatientLinkService }) {
  if (!accountUid || !['admin', 'manager'].includes(role) || !patientId) return null;
  return <LinkEditor key={`${accountUid}:${role}:${patientId}`} patientId={patientId} api={api} />;
}
SqlPatientLinkManager.propTypes = { accountUid: PropTypes.string.isRequired, role: PropTypes.string.isRequired, patientId: PropTypes.string.isRequired, api: PropTypes.object };
