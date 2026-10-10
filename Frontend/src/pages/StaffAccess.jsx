import { useEffect, useMemo, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Link, Navigate } from 'react-router-dom';
import NotificationMenu from '../components/NotificationMenu';
import { auth, firestore, functions } from '../lib/firebase';
import { publicUrl } from '../lib/portals';

const blankProfile = { name: '', email: '', role: 'receptionist', doctorId: '', password: '' };
const roles = [{ value: 'admin', label: 'Administrator' }, { value: 'doctor', label: 'Doctor' }, { value: 'receptionist', label: 'Reception' }];

const StaffAccess = () => {
  const [state, setState] = useState('checking');
  const [staff, setStaff] = useState([]);
  const [panel, setPanel] = useState('directory');
  const [selectedUid, setSelectedUid] = useState('');
  const [profile, setProfile] = useState(blankProfile);
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) { setState('signed-out'); return; }
    const token = await user.getIdTokenResult();
    setState(token.claims.forcePasswordChange === true ? 'password-change' : token.claims.role === 'admin' ? 'allowed' : 'denied');
  }), []);

  useEffect(() => {
    if (state !== 'allowed') return undefined;
    return onSnapshot(collection(firestore, 'staffProfiles'), (snapshot) => {
      const records = snapshot.docs.map((item) => ({ uid: item.id, ...item.data() })).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
      setStaff(records);
    }, () => setError('The staff directory could not be loaded.'));
  }, [state]);

  useEffect(() => {
    if (state !== 'allowed') return undefined;
    let active = true;
    httpsCallable(functions, 'syncManagedStaffDirectory')()
      .then((result) => { if (active && result.data.imported) setNotice('Existing staff access records were synchronised securely.'); })
      .catch(() => { if (active) setError('The staff directory could not be synchronised. You can still manage existing directory records.'); });
    return () => { active = false; };
  }, [state]);

  const selected = useMemo(() => staff.find((member) => member.uid === selectedUid) || null, [staff, selectedUid]);
  const openCreate = () => { setPanel('create'); setSelectedUid(''); setProfile(blankProfile); setTemporaryPassword(''); setError(''); };
  const openManage = (member) => { setPanel('manage'); setSelectedUid(member.uid); setProfile({ name: member.name || '', email: member.email || '', role: member.role || 'receptionist', doctorId: member.doctorId || '', password: '' }); setTemporaryPassword(''); setError(''); };
  const call = async (payload) => httpsCallable(functions, 'manageStaffAccount')(payload);

  const createStaff = async (event) => {
    event.preventDefault(); setError(''); setNotice(''); setBusy(true);
    try {
      const result = await call({ action: 'provision', email: profile.email, displayName: profile.name, role: profile.role, doctorId: profile.role === 'doctor' ? profile.doctorId : undefined, password: profile.password });
      setNotice(result.data.message); setPanel('directory'); setProfile(blankProfile);
    } catch (caught) { setError(caught?.message || 'Unable to create the staff account.'); } finally { setBusy(false); }
  };
  const saveAccess = async (event) => {
    event.preventDefault(); if (!selected) return; setError(''); setNotice(''); setBusy(true);
    try {
      const result = await call({ action: 'updateAccess', email: selected.email, displayName: profile.name, role: profile.role, doctorId: profile.role === 'doctor' ? profile.doctorId : undefined });
      setNotice(result.data.message); setPanel('directory');
    } catch (caught) { setError(caught?.message || 'Unable to update staff access.'); } finally { setBusy(false); }
  };
  const runAction = async (action, confirmation) => {
    if (!selected || (confirmation && !window.confirm(confirmation))) return;
    setError(''); setNotice(''); setBusy(true);
    try {
      const result = await call({ action, email: selected.email, disabled: action === 'disable' ? selected.active !== false : undefined });
      setNotice(result.data.message); if (action === 'disable') setPanel('directory');
    } catch (caught) { setError(caught?.message || 'Unable to update staff access.'); } finally { setBusy(false); }
  };
  const submitTemporaryPassword = async (event) => {
    event.preventDefault(); if (!selected) return; setError(''); setNotice(''); setBusy(true);
    try {
      const result = await call({ action: 'temporaryPassword', email: selected.email, password: temporaryPassword });
      setNotice(result.data.message); setTemporaryPassword(''); setPanel('manage');
    } catch (caught) { setError(caught?.message || 'Unable to set a temporary password.'); } finally { setBusy(false); }
  };

  if (state === 'signed-out') return <Navigate to="/staff/login" replace />;
  if (state === 'password-change') return <Navigate to="/staff/account" replace />;
  if (state === 'denied') return <main className="staff-shell"><section className="workspace-gate"><p>STAFF ACCESS</p><h1>Administrator access required</h1><span>Your account is not authorised to manage staff accounts.</span><button type="button" className="staff-secondary-button" onClick={() => signOut(auth)}>Sign out</button></section></main>;
  if (state === 'checking') return <main className="staff-shell"><p className="workspace-status">Verifying administrator access…</p></main>;

  const formFields = <><label>Full name<input value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} autoComplete="name" required /></label><label>Work email<input value={profile.email} disabled={panel !== 'create'} onChange={(event) => setProfile({ ...profile, email: event.target.value })} type="email" autoComplete="email" required /></label><label>Workspace role<select value={profile.role} onChange={(event) => setProfile({ ...profile, role: event.target.value, doctorId: event.target.value === 'doctor' ? profile.doctorId : '' })}>{roles.map((role) => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label>{profile.role === 'doctor' && <label>Doctor ID<input value={profile.doctorId} onChange={(event) => setProfile({ ...profile, doctorId: event.target.value })} placeholder="e.g. brig-ak-sood" pattern="[A-Za-z0-9_-]{2,80}" required /><small>Stable identifier used to scope the doctor’s calendar and appointments.</small></label>}</>;

  return <main className="staff-shell">
    <header className="staff-topbar"><Link to="/staff/admin" className="staff-wordmark">SOOD CLINIC</Link><nav><Link to="/staff/admin">Overview</Link><Link to="/staff/admin/patients">Patients</Link><Link to="/staff/admin/catalogue">Booking setup</Link><Link to="/staff/admin/access" className="is-active">Staff access</Link><Link to="/staff/admin/audit">Activity</Link><NotificationMenu /><Link to="/staff/account">My account</Link><a href={publicUrl('/')}>View public site</a><button type="button" onClick={() => signOut(auth)}>Sign out</button></nav></header>
    <div className="staff-access">
      <header className="staff-access__heading"><div><p className="section-kicker">Identity & access</p><h1>Staff access</h1><span>Create and manage clinic accounts through the trusted server. Every access change is logged and immediately revokes active refresh sessions.</span></div><button type="button" onClick={openCreate}>Add staff member</button></header>
      {notice && <p className="admin-notice" role="status">{notice}</p>}{error && <p className="staff-login__error" role="alert">{error}</p>}
      {panel === 'directory' && <section className="admin-panel staff-access__directory"><div className="admin-panel__head"><div><p className="section-kicker">Directory</p><h2>{staff.length} managed account{staff.length === 1 ? '' : 's'}</h2></div></div>{staff.length ? <ul>{staff.map((member) => <li key={member.uid}><div><strong>{member.name || 'Unnamed staff member'}</strong><span>{member.email}</span><small>{member.role === 'doctor' && member.doctorId ? `Doctor ID: ${member.doctorId}` : roles.find((role) => role.value === member.role)?.label || member.role}</small></div><div><span className={member.active === false ? 'staff-status staff-status--inactive' : 'staff-status'}>{member.active === false ? 'Suspended' : member.requiresPasswordChange ? 'Password change required' : 'Active'}</span><button type="button" onClick={() => openManage(member)}>Manage</button></div></li>)}</ul> : <p className="empty-state">No managed staff accounts yet.</p>}<p className="admin-panel__footnote">Suspending an account prevents future sign-ins. Session revocation causes active refresh sessions to expire; existing Firebase ID tokens can remain valid for up to one hour.</p></section>}
      {panel === 'create' && <form className="admin-panel admin-form staff-access__form" onSubmit={createStaff}><div><p className="section-kicker">New account</p><h2>Add staff member</h2><span>The staff member will be required to replace the temporary password before entering their workspace.</span></div>{formFields}<label>Temporary password<input type="password" value={profile.password} onChange={(event) => setProfile({ ...profile, password: event.target.value })} minLength="12" autoComplete="new-password" required /><small>At least 12 characters, including letters and numbers. Share it only through a secure channel.</small></label><div className="staff-access__actions"><button type="button" className="staff-secondary-button" onClick={() => setPanel('directory')}>Cancel</button><button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create staff account'}</button></div></form>}
      {panel === 'manage' && selected && <><form className="admin-panel admin-form staff-access__form" onSubmit={saveAccess}><div><p className="section-kicker">Account access</p><h2>{selected.name || selected.email}</h2><span>Changing a role or doctor ID ends the member’s refresh sessions and applies at their next sign-in.</span></div>{formFields}<div className="staff-access__actions"><button type="button" className="staff-secondary-button" onClick={() => setPanel('directory')}>Back to directory</button><button type="submit" disabled={busy || selected.uid === auth.currentUser?.uid}>{busy ? 'Saving…' : 'Save access'}</button></div>{selected.uid === auth.currentUser?.uid && <small>You cannot change your own administrator role from this screen.</small>}</form><section className="admin-panel admin-form staff-access__security"><div><p className="section-kicker">Security actions</p><h2>Account controls</h2><span>Use these only when required. Each action is recorded in the protected audit log.</span></div><div className="staff-access__actions"><button type="button" className="staff-secondary-button" onClick={() => setPanel('temporary-password')} disabled={busy}>Set temporary password</button><button type="button" className="staff-secondary-button" onClick={() => runAction('revokeSessions', `Revoke all active sessions for ${selected.email}?`)} disabled={busy || selected.uid === auth.currentUser?.uid}>Revoke sessions</button><button type="button" className="button-danger" onClick={() => runAction('disable', selected.active === false ? `Restore ${selected.email}?` : `Suspend ${selected.email}? They will lose staff sign-in access.`)} disabled={busy || selected.uid === auth.currentUser?.uid}>{selected.active === false ? 'Restore account' : 'Suspend account'}</button></div></section></>}
      {panel === 'temporary-password' && selected && <form className="admin-panel admin-form staff-access__form" onSubmit={submitTemporaryPassword}><div><p className="section-kicker">Credential recovery</p><h2>Set temporary password</h2><span>{selected.name || selected.email} will be required to set a new password on their next sign-in. Existing refresh sessions will be revoked.</span></div><label>New temporary password<input type="password" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} minLength="12" autoComplete="new-password" required /><small>At least 12 characters, including letters and numbers. Do not send it through an insecure channel.</small></label><div className="staff-access__actions"><button type="button" className="staff-secondary-button" onClick={() => setPanel('manage')}>Cancel</button><button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Set temporary password'}</button></div></form>}
    </div>
  </main>;
};

export default StaffAccess;
