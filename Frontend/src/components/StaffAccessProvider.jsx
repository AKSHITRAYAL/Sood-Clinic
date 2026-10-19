import { useContext, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { staffAccessState, watchStaffSession } from '../services/staffSessionService';
import { StaffContext } from '../lib/staffSessionContext';

export function StaffAccessProvider({ children }) {
  const [session, setSession] = useState({ status: 'checking', user: undefined });
  const observer = useRef(null);
  const location = useLocation();
  useEffect(() => {
    const current = watchStaffSession(setSession);
    observer.current = current;
    const refresh = () => { if (document.visibilityState !== 'hidden') current.refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { current.unsubscribe(); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, []);
  useEffect(() => { observer.current?.refresh(); }, [location.pathname]);
  return <StaffContext.Provider value={{ ...session, refresh: () => observer.current?.refresh(true) }}>{children}</StaffContext.Provider>;
}

export function StaffRoute({ role, allowPasswordChange = false }) {
  const session = useContext(StaffContext);
  const state = staffAccessState(session, role, allowPasswordChange);
  if (state === 'signed-out') return <Navigate to="/staff/login" replace />;
  if (state === 'password-change') return <Navigate to="/staff/account" replace />;
  if (state === 'checking') return <main className="staff-shell"><p role="status">Verifying staff access…</p></main>;
  if (state === 'error') return <main className="staff-shell"><section className="workspace-gate"><h1>Staff access could not be verified</h1><p>Retry, or sign in again to verify your current access.</p><button type="button" onClick={session.refresh}>Retry verification</button><Link to="/staff/login" onClick={() => signOut(auth)}>Sign in again</Link></section></main>;
  if (state === 'denied') return <main className="staff-shell"><section className="workspace-gate"><h1>Access required</h1><p>This account is not assigned to this workspace.</p><Link to="/staff">Staff home</Link><button type="button" onClick={() => signOut(auth)}>Sign out</button></section></main>;
  return <Outlet />;
}

StaffAccessProvider.propTypes = { children: PropTypes.node };
StaffRoute.propTypes = { role: PropTypes.string, allowPasswordChange: PropTypes.bool };
