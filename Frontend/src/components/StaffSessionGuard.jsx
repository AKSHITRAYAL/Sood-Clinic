import { useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase';

// Staff sessions should not remain open on a shared clinic workstation. Firebase
// persistence still protects refreshes; this adds an application idle boundary.
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'focus'];

const StaffSessionGuard = ({ children }) => {
  const navigate = useNavigate();
  useEffect(() => {
    let timer;
    const clearTimer = () => { if (timer) window.clearTimeout(timer); };
    const expire = async () => {
      await signOut(auth);
      window.sessionStorage.setItem('staff-session-expired', '1');
      navigate('/staff/login', { replace: true });
    };
    const reset = () => {
      clearTimer();
      if (auth.currentUser) timer = window.setTimeout(expire, IDLE_TIMEOUT_MS);
    };
    const unsubscribe = onAuthStateChanged(auth, reset);
    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    return () => { clearTimer(); unsubscribe(); ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, reset)); };
  }, [navigate]);
  return children;
};

export default StaffSessionGuard;
