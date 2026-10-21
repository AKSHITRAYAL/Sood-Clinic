import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import SqlClinicDay from '../components/SqlClinicDay';
import SqlWeeklyHours from '../components/SqlWeeklyHours';
import SqlSpecialHours from '../components/SqlSpecialHours';

// Staged for the coordinated SQL schedule cutover. Deliberately not registered
// in any staff route; role and doctor scope come from custom claims only and
// each component keeps its own server-side authority checks.
export default function SqlStaffSchedule() {
  const [session, setSession] = useState({ accountUid: '', role: '', doctorId: '' });
  useEffect(() => onAuthStateChanged(auth, async user => {
    if (!user) { setSession({ accountUid: '', role: '', doctorId: '' }); return; }
    const { claims } = await user.getIdTokenResult();
    setSession({
      accountUid: user.uid,
      role: typeof claims.role === 'string' ? claims.role : '',
      doctorId: typeof claims.doctorId === 'string' ? claims.doctorId : '',
    });
  }), []);
  return <main>
    <SqlClinicDay accountUid={session.accountUid} role={session.role} assignedDoctorId={session.doctorId} />
    <SqlWeeklyHours accountUid={session.accountUid} role={session.role} assignedDoctorId={session.doctorId} />
    <SqlSpecialHours accountUid={session.accountUid} role={session.role} assignedDoctorId={session.doctorId} />
  </main>;
}
