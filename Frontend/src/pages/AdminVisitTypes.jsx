import { useCallback, useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { useStaffAccess } from '../lib/staffSessionContext';
import { Link, Navigate } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { getBookingSettings, saveBookingSettings } from '../services/bookingSettingsService';

const fresh = () => ({ id: '', label: '', minutes: 20, mode: 'in_person', active: true });
const policyFields = [
  ['bookingWindowDays', 'Booking window (days)', 1, 90], ['leadMinutes', 'Minimum notice (minutes)', 0, 1440],
  ['intervalMinutes', 'Time-slot interval (minutes)', 5, 240], ['bufferBeforeMinutes', 'Buffer before visits (minutes)', 0, 120],
  ['bufferAfterMinutes', 'Buffer after visits (minutes)', 0, 120], ['cancelCutoffMinutes', 'Cancellation / rescheduling cutoff (minutes)', 0, 10080],
];

const AdminVisitTypes = () => {
  const { state: access } = useStaffAccess('admin');
  const [config, setConfig] = useState(null);
  const [policy, setPolicy] = useState(null);
  const [draft, setDraft] = useState(fresh());
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(null);
  const reset = () => { setDraft(fresh()); setEditingId(''); };
  const load = useCallback(async () => {
    setLoading(true); setError(''); setConfig(null);
    try { const data = await getBookingSettings(); setConfig(data); setPolicy(data.settings); }
    catch (caught) { setError(caught?.message || 'Booking configuration could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { if (access === 'allowed') load(); }, [access, load]);
  const visitTypes = config?.visitTypes || [];
  const policyDirty = config && JSON.stringify(policy) !== JSON.stringify(config.settings);
  const formatDirty = Boolean(editingId || draft.id || draft.label);
  const unavailable = busy || loading || !config;
  const commit = async (kind, payload) => {
    if (unavailable) return;
    setBusy(true); setError(''); setNotice('');
    const fingerprint = JSON.stringify({ kind, payload, expectedUpdatedAt: config.updatedAt });
    if (pending.current?.fingerprint !== fingerprint) pending.current = { fingerprint, requestId: crypto.randomUUID() };
    try {
      const result = await saveBookingSettings(kind, payload, config.updatedAt, pending.current.requestId);
      setNotice(result.message); reset(); pending.current = null; await load();
    } catch (caught) { setError(caught?.message || 'Save could not be confirmed. Retry unchanged details or reload.'); }
    finally { setBusy(false); }
  };
  const saveFormat = event => { event.preventDefault(); commit('service', { ...draft, id: editingId || draft.id.trim(), minutes: Number(draft.minutes) }); };
  const savePolicy = event => { event.preventDefault(); commit('settings', policy); };
  const edit = item => { setDraft({ ...item }); setEditingId(item.id); setNotice(''); setError(''); };

  if (access === 'signed-out') return <Navigate to="/staff/login" replace />;
  if (access === 'password-change') return <Navigate to="/staff/account" replace />;
  if (access === 'denied') return <main className="staff-shell"><section className="workspace-gate"><p>SOOD CLINIC STAFF</p><h1>Administrator access required</h1><button type="button" onClick={() => signOut(auth)}>Sign out</button></section></main>;
  if (access === 'checking') return <main className="staff-shell"><p className="workspace-status">Verifying secure administrator access…</p></main>;
  return <main className="staff-shell">
    <header className="staff-topbar"><Link to="/staff/admin" className="staff-wordmark">SOOD CLINIC</Link><nav><Link to="/staff/admin">Overview</Link><Link to="/staff/admin/patients">Patients</Link><Link to="/staff/admin/catalogue">Booking setup</Link><Link to="/staff/admin/visit-types" className="is-active">Visit formats</Link><Link to="/staff/video">Video visits</Link><Link to="/staff/admin/access">Staff access</Link><Link to="/staff/admin/audit">Activity</Link><Link to="/staff/account">My account</Link><button type="button" onClick={() => signOut(auth)}>Sign out</button></nav></header>
    <div className="admin-catalogue">
      <header className="staff-access__heading"><div><p className="section-kicker">Appointment settings</p><h1>Booking policy and visit formats</h1><span>Changes apply to future booking and online appointment changes. Existing appointments are not rewritten. Timezone: Asia/Kolkata.</span></div><button type="button" disabled={busy || loading} onClick={() => { reset(); pending.current = null; setNotice(''); load(); }}>Reload / discard edits</button></header>
      {notice && <p className="admin-notice" role="status">{notice}</p>}{error && <p className="staff-login__error" role="alert">{error}</p>}
      {loading && <p role="status">Loading booking configuration…</p>}
      {config && <>
        <form className="admin-panel admin-form catalogue-editor" onSubmit={savePolicy}>
          <h2>Booking policy</h2><p>Save or discard changes in one form before editing the other.</p>
          <div className="patient-form__grid">{policyFields.map(([key, label, min, max]) => <label key={key}>{label}<input type="number" min={min} max={max} step="1" required disabled={unavailable || formatDirty} value={policy[key]} onChange={event => setPolicy(current => ({ ...current, [key]: event.target.value === '' ? '' : Number(event.target.value) }))} /></label>)}</div>
          <label className="catalogue-check"><input type="checkbox" disabled={unavailable || formatDirty} checked={policy.autoConfirm} onChange={event => setPolicy(current => ({ ...current, autoConfirm: event.target.checked }))} /> Automatically confirm new appointments</label>
          <button type="submit" disabled={unavailable || formatDirty || !policyDirty}>{busy ? 'Saving…' : 'Save booking policy'}</button>
        </form>
        <section className="admin-catalogue__grid">
          <section className="admin-panel catalogue-directory"><div className="admin-panel__head"><div><p className="section-kicker">Available formats</p><h2>{visitTypes.length} retained format{visitTypes.length === 1 ? '' : 's'}</h2></div><button type="button" className="staff-secondary-button" disabled={unavailable || policyDirty} onClick={reset}>New format</button></div>
            <ul>{visitTypes.map(item => <li key={item.id}><div><strong>{item.label}</strong><span>{item.mode === 'video' ? 'Online video consultation' : 'In-clinic consultation'} · {item.minutes} minutes</span><small>{item.active ? 'Available to patients' : 'Hidden from public booking'}</small></div><div className="staff-directory__actions"><button type="button" disabled={unavailable || policyDirty} onClick={() => edit(item)}>Edit</button><button type="button" className="staff-secondary-button" disabled={unavailable || policyDirty || formatDirty} onClick={() => commit('service', { ...item, active: !item.active })}>{item.active ? 'Hide' : 'Enable'}</button></div></li>)}</ul>
          </section>
          <form className="admin-panel admin-form catalogue-editor" onSubmit={saveFormat}>
            <div><p className="section-kicker">{editingId ? 'Edit format' : 'New format'}</p><h2>{editingId ? draft.label || editingId : 'Add an appointment format'}</h2><span>Keep at least one active format. Hide old formats instead of deleting them; use a new ID for a different delivery mode. No video room is created automatically.</span></div>
            <label>Format ID<input value={draft.id} disabled={unavailable || policyDirty || Boolean(editingId)} onChange={event => setDraft({ ...draft, id: event.target.value })} required maxLength={80} pattern="[a-z][a-z0-9_-]{1,79}" placeholder="e.g. video-consultation" /></label>
            <label>Patient-facing label<input value={draft.label} disabled={unavailable || policyDirty} onChange={event => setDraft({ ...draft, label: event.target.value })} required maxLength={100} /></label>
            <label>Appointment delivery<select value={draft.mode} disabled={unavailable || policyDirty || Boolean(editingId)} onChange={event => setDraft({ ...draft, mode: event.target.value })}><option value="in_person">In-clinic</option><option value="video">Online video</option></select></label>
            <label>Duration (minutes)<input type="number" min="5" max="240" step="1" disabled={unavailable || policyDirty} value={draft.minutes} onChange={event => setDraft({ ...draft, minutes: event.target.value })} required /></label>
            <label className="catalogue-check"><input type="checkbox" disabled={unavailable || policyDirty} checked={draft.active} onChange={event => setDraft({ ...draft, active: event.target.checked })} /> Available in public booking</label>
            <div className="staff-access__actions"><button type="button" className="staff-secondary-button" disabled={busy} onClick={reset}>Cancel</button><button type="submit" disabled={unavailable || policyDirty}>{busy ? 'Saving…' : 'Save format'}</button></div>
          </form>
        </section>
      </>}
    </div>
  </main>;
};
export default AdminVisitTypes;
