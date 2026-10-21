import { useCallback, useEffect, useRef, useState } from 'react';
import { getAdminClinicContact, saveAdminClinicContact } from '../services/adminClinicContactService';

const fields = [
  { key: 'name', label: 'Clinic name', max: 160 },
  { key: 'phone', label: 'Public phone (international format)', type: 'tel', max: 16, placeholder: '+918988207797', pattern: '\\+[1-9][0-9]{7,14}' },
  { key: 'email', label: 'Public email', type: 'email', max: 254 },
  { key: 'address', label: 'Public clinic address', max: 500 },
];

export default function AdminClinicContact() {
  const [profile, setProfile] = useState(null);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(null);
  const load = useCallback(async () => {
    setLoading(true); setError(''); setProfile(null);
    try {
      const current = await getAdminClinicContact();
      setProfile(Object.fromEntries(fields.map(({ key }) => [key, current[key]])));
      setExpectedUpdatedAt(current.updatedAt); pending.current = null;
    } catch (caught) { setError(caught?.message || 'Clinic details could not be loaded. Please retry.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async event => {
    event.preventDefault();
    if (!profile || busy || loading) return;
    setBusy(true); setError(''); setNotice('');
    const payload = { profile, expectedUpdatedAt };
    const fingerprint = JSON.stringify(payload);
    // Keep the same retry ID after a lost response; editing creates a new intent.
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, requestId: crypto.randomUUID() };
    try {
      const result = await saveAdminClinicContact({ ...payload, requestId: pending.current.requestId });
      setNotice(result.message); await load();
    } catch (caught) { setError(caught?.message || 'Save could not be confirmed. Retry unchanged details or reload before editing.'); }
    finally { setBusy(false); }
  };

  return <section className="admin-panel admin-form" aria-labelledby="clinic-contact-heading">
    <div className="admin-panel__head"><div><p className="section-kicker">SQL-backed clinic settings</p><h2 id="clinic-contact-heading">Public contact details</h2><span>These details are published on the Contact page. Do not enter a private mailbox or a personal address.</span></div>
      <button type="button" className="staff-secondary-button" disabled={busy || loading} onClick={() => { setNotice(''); load(); }}>Reload details</button></div>
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    {error && <p className="staff-login__error" role="alert">{error}</p>}
    {loading ? <p role="status">Loading clinic details…</p> : profile && <form className="patient-form" onSubmit={save}>
      <fieldset disabled={busy}><legend>Published clinic contact</legend><div className="patient-form__grid">
        {fields.map(({ key, label, max, ...attributes }) => <label key={key}>{label}<input {...attributes} value={profile[key]} maxLength={max} required onChange={event => setProfile(current => ({ ...current, [key]: event.target.value }))} /></label>)}
      </div><p>Timezone: Asia/Kolkata (IST). Open public pages may cache details for up to five minutes.</p>
      <button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save public contact'}</button></fieldset>
    </form>}
  </section>;
}
