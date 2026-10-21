import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import PasswordRequirements from './PasswordRequirements';
import { hasStrongPassword, passwordPolicyMessage } from '../lib/passwordPolicy';
import { sqlPatientSecurityService } from '../services/sqlPatientSecurityService';
const ignoreBusy = () => {};

function Security({ accountUid, api, onBusyChange }) {
  const [currentPassword, setCurrentPassword] = useState(''); const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [cooldown, setCooldown] = useState(false); const alive = useRef(false); const timeout = useRef(null); const running = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; window.clearTimeout(timeout.current); }; }, []);
  const change = async event => {
    event.preventDefault(); if (running.current) return;
    if (!currentPassword || !hasStrongPassword(newPassword)) { setError(passwordPolicyMessage); return; }
    running.current = true; setBusy(true); onBusyChange(true); setError(''); setNotice('');
    const oldValue = currentPassword; const newValue = newPassword;
    setCurrentPassword(''); setNewPassword('');
    try {
      const result = await api.changePassword(accountUid, oldValue, newValue);
      if (alive.current) {
        if (result?.changed !== true) throw Error('Unconfirmed password change');
        setNotice('Password changed. Sign in again with your new password.');
      }
    } catch { if (alive.current) setError('Password change could not be confirmed. Check your sign-in details; if the old password no longer works, use a reset link.'); }
    finally { if (alive.current) { setBusy(false); onBusyChange(false); running.current = false; } }
  };
  const reset = async () => {
    if (running.current || cooldown) return;
    running.current = true; setBusy(true); onBusyChange(true); setError(''); setNotice(''); setCooldown(true);
    timeout.current = window.setTimeout(() => { if (alive.current) setCooldown(false); }, 60000);
    try {
      const result = await api.sendReset(accountUid);
      if (alive.current) {
        if (result?.sent !== true) throw Error('Unconfirmed reset request');
        setNotice('A password-reset request was sent for your signed-in account. Check its email inbox and spam folder.');
      }
    } catch { if (alive.current) setError('The reset request could not be confirmed. Please wait before retrying.'); }
    finally { if (alive.current) { setBusy(false); onBusyChange(false); running.current = false; } }
  };
  return <section className="patient-page-card"><h2>Account security</h2>
    {error && <p role="alert" className="staff-login__error">{error}</p>}{notice && <p role="status" className="admin-notice">{notice}</p>}
    <form onSubmit={change} className="patient-form"><fieldset disabled={busy}><legend>Change your password</legend>
      <label>Current password<input type="password" autoComplete="current-password" required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></label>
      <label>New password<input type="password" autoComplete="new-password" required value={newPassword} onChange={event => setNewPassword(event.target.value)} /></label>
      <PasswordRequirements password={newPassword} />
    </fieldset><button type="submit" disabled={busy || !currentPassword || !hasStrongPassword(newPassword)}>{busy ? 'Working…' : 'Change password and sign out'}</button></form>
    <button type="button" className="staff-secondary-button" disabled={busy || cooldown} onClick={reset}>{cooldown ? 'Wait before another reset request' : 'Send a password-reset link'}</button>
    <p>Credentials are not stored in browser storage or SQL. This patient panel does not change staff passwords or enable SMS MFA.</p>
  </section>;
}
Security.propTypes = { accountUid: PropTypes.string.isRequired, api: PropTypes.object.isRequired, onBusyChange: PropTypes.func.isRequired };
export default function SqlPatientSecurity({ accountUid, api = sqlPatientSecurityService, onBusyChange = ignoreBusy }) {
  if (!accountUid) return null;
  return <Security key={accountUid} accountUid={accountUid} api={api} onBusyChange={onBusyChange} />;
}
SqlPatientSecurity.propTypes = { accountUid: PropTypes.string.isRequired, api: PropTypes.object, onBusyChange: PropTypes.func };
