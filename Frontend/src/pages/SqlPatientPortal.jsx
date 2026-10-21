import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import SqlPatientModule from '../components/SqlPatientModule';
import { sqlPatientService } from '../services/sqlPatientService';
import { sqlPatientSecurityService } from '../services/sqlPatientSecurityService';

// Staged for the coordinated SQL patient cutover. Deliberately not registered in
// any router: mounting this instead of the live portal is part of the release
// that must ship with the cutover, not before it.
export default function SqlPatientPortal() {
  const [accountUid, setAccountUid] = useState('');
  useEffect(() => onAuthStateChanged(auth, user => setAccountUid(user?.uid ?? '')), []);
  if (!accountUid) return <main><p role="status">Sign in with your patient account to continue.</p></main>;
  return <main>
    <SqlPatientModule accountUid={accountUid} patientApi={sqlPatientService} securityApi={sqlPatientSecurityService} />
  </main>;
}
