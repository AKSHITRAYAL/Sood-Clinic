import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import SqlStaffPatientWorkspace from '../components/SqlStaffPatientWorkspace';
import { sqlPatientLinkService } from '../services/sqlPatientLinkService';

// Staged for the coordinated SQL patient cutover. Deliberately not registered in
// any staff route; the role gate below reads custom claims only and the server
// callables remain the permission authority.
export default function SqlStaffPatients() {
  const [session, setSession] = useState({ accountUid: '', role: '' });
  useEffect(() => onAuthStateChanged(auth, async user => {
    if (!user) { setSession({ accountUid: '', role: '' }); return; }
    const { claims } = await user.getIdTokenResult();
    setSession({ accountUid: user.uid, role: typeof claims.role === 'string' ? claims.role : '' });
  }), []);
  return <main>
    <SqlStaffPatientWorkspace accountUid={session.accountUid} role={session.role} linkApi={sqlPatientLinkService} />
  </main>;
}
