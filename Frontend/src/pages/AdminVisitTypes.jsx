import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { Link, Navigate } from 'react-router-dom';
import NotificationMenu from '../components/NotificationMenu';
import { auth, functions } from '../lib/firebase';

const fresh = () => ({ id: '', label: '', minutes: 20, mode: 'in_person', active: true });

const AdminVisitTypes = () => {
  const [access, setAccess] = useState('checking');
  const [visitTypes, setVisitTypes] = useState([]);
  const [draft, setDraft] = useState(fresh());
  const [editingId, setEditingId] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try {
      const result = await httpsCallable(functions, 'getAdminBookingConfiguration')();
      setVisitTypes(result.data.visitTypes || []);
    } catch (caught) { setError(caught?.message || 'Appointment formats could not be loaded.'); }
  }, []);

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) return setAccess('signed-out');
    const token = await user.getIdTokenResult();
    setAccess(token.claims.forcePasswordChange ? 'password-change' : token.claims.role === 'admin' ? 'allowed' : 'denied');
  }), []);
  useEffect(() => { if (access === 'allowed') load(); }, [access, load]);

  const reset = () => { setDraft(fresh()); setEditingId(''); };
  const save = async (event) => {
    event.preventDefault();
    const id = draft.id.trim();
    const next = editingId ? visitTypes.map((item) => item.id === editingId ? { ...draft, id: editingId, minutes: Number(draft.minutes) } : item) : [...visitTypes, { ...draft, id, minutes: Number(draft.minutes) }];
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await httpsCallable(functions, 'saveBookingVisitTypes')({ visitTypes: next });
      setVisitTypes(result.data.visitTypes || next); setNotice(result.data.message || 'Appointment formats saved.'); reset();
    } catch (caught) { setError(caught?.message || 'Appointment formats could not be saved.'); } finally { setBusy(false); }
  };
  const edit = (item) => { setDraft({ ...item }); setEditingId(item.id); setNotice(''); setError(''); };
  const toggle = async (item) => {
    const next = visitTypes.map((entry) => entry.id === item.id ? { ...entry, active: !entry.active } : entry);
    setBusy(true); setError('');
    try { const result = await httpsCallable(functions, 'saveBookingVisitTypes')({ visitTypes: next }); setVisitTypes(result.data.visitTypes || next); setNotice(result.data.message || 'Appointment formats saved.'); }
    catch (caught) { setError(caught?.message || 'Appointment format could not be updated.'); } finally { setBusy(false); }
  };

  if (access === 'signed-out') return <Navigate to="/staff/login" replace />;
  if (access === 'password-change') return <Navigate to="/staff/account" replace />;
  if (access === 'denied') return <main className="staff-shell"><section className="workspace-gate"><p>SOOD CLINIC STAFF</p><h1>Administrator access required</h1><button type="button" onClick={() => signOut(auth)}>Sign out</button></section></main>;
  if (access === 'checking') return <main className="staff-shell"><p className="workspace-status">Verifying secure administrator access…</p></main>;

  return <main className="staff-shell"><header className="staff-topbar"><Link to="/staff/admin" className="staff-wordmark">SOOD CLINIC</Link><nav><Link to="/staff/admin">Overview</Link><Link to="/staff/admin/patients">Patients</Link><Link to="/staff/admin/catalogue">Booking setup</Link><Link to="/staff/admin/visit-types" className="is-active">Visit formats</Link><Link to="/staff/video">Video visits</Link><Link to="/staff/admin/access">Staff access</Link><Link to="/staff/admin/audit">Activity</Link><NotificationMenu /><Link to="/staff/account">My account</Link><button type="button" onClick={() => signOut(auth)}>Sign out</button></nav></header><div className="admin-catalogue"><header className="staff-access__heading"><div><p className="section-kicker">Appointment settings</p><h1>Visit formats</h1><span>Offer in-clinic and online video appointments. Video rooms are never created by the website; staff add a secure joining link when one is ready.</span></div></header>{notice && <p className="admin-notice" role="status">{notice}</p>}{error && <p className="staff-login__error" role="alert">{error}</p>}<section className="admin-catalogue__grid"><section className="admin-panel catalogue-directory"><div className="admin-panel__head"><div><p className="section-kicker">Available formats</p><h2>{visitTypes.length} format{visitTypes.length === 1 ? '' : 's'}</h2></div><button type="button" className="staff-secondary-button" onClick={reset}>New format</button></div>{visitTypes.length ? <ul>{visitTypes.map((item) => <li key={item.id}><div><strong>{item.label}</strong><span>{item.mode === 'video' ? 'Online video consultation' : 'In-clinic consultation'} · {item.minutes} minutes</span><small>{item.active ? 'Available to patients' : 'Hidden from public booking'}</small></div><div className="staff-directory__actions"><button type="button" onClick={() => edit(item)}>Edit</button><button type="button" className="staff-secondary-button" disabled={busy} onClick={() => toggle(item)}>{item.active ? 'Hide' : 'Enable'}</button></div></li>)}</ul> : <p className="empty-state">Loading appointment formats…</p>}</section><form className="admin-panel admin-form catalogue-editor" onSubmit={save}><div><p className="section-kicker">{editingId ? 'Edit format' : 'New format'}</p><h2>{editingId ? draft.label || editingId : 'Add an appointment format'}</h2><span>Use a stable ID. Deactivate a format rather than removing it once patients have booked it.</span></div><label>Format ID<input value={draft.id} disabled={Boolean(editingId)} onChange={(event) => setDraft({ ...draft, id: event.target.value })} required pattern="[a-z][a-z0-9_-]{1,79}" placeholder="e.g. video-consultation" /><small>Lowercase letters, numbers, hyphens and underscores only.</small></label><label>Patient-facing label<input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} required placeholder="e.g. Online video consultation" /></label><label>Appointment delivery<select value={draft.mode} onChange={(event) => setDraft({ ...draft, mode: event.target.value })}><option value="in_person">In-clinic</option><option value="video">Online video</option></select></label><label>Duration (minutes)<input type="number" min="5" max="240" value={draft.minutes} onChange={(event) => setDraft({ ...draft, minutes: event.target.value })} required /></label><label className="catalogue-check"><input type="checkbox" checked={draft.active} onChange={(event) => setDraft({ ...draft, active: event.target.checked })} /> Available in public booking</label><div className="staff-access__actions"><button type="button" className="staff-secondary-button" onClick={reset}>Cancel</button><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save format'}</button></div></form></section></div></main>;
};

export default AdminVisitTypes;
