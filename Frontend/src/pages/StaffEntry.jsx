import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Navigate } from 'react-router-dom';
import { auth } from '../lib/firebase';

const StaffEntry = () => {
  const [destination, setDestination] = useState(null);
  useEffect(() => onAuthStateChanged(auth, async (user) => {
    if (!user) { setDestination('/staff/login'); return; }
    const token = await user.getIdTokenResult();
    if (token.claims.role === 'admin') setDestination('/staff/admin');
    else if (token.claims.role === 'doctor' && token.claims.doctorId === 'brig-ak-sood') setDestination('/staff/doctor');
    else if (token.claims.role === 'receptionist') setDestination('/staff/reception');
    else setDestination('/staff/login');
  }), []);
  return destination ? <Navigate to={destination} replace /> : <main className="staff-shell"><p className="workspace-status">Opening staff workspace…</p></main>;
};

export default StaffEntry;
