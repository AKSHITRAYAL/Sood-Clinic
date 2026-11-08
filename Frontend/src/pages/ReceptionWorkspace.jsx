import { Link, Navigate } from 'react-router-dom';
import StaffLayout from '../components/StaffLayout';
import { useStaffAccess } from '../lib/staffSessionContext';

const ReceptionWorkspace = () => {
  const { state } = useStaffAccess('receptionist');
  if (state === 'signed-out') return <Navigate to="/staff/login" replace />;
  if (state === 'password-change') return <Navigate to="/staff/account" replace />;
  if (state !== 'allowed') return <main className="staff-shell"><p className="workspace-status">Verifying staff access…</p></main>;
  return <StaffLayout><div className="staff-admin"><header className="staff-admin__heading"><div><p className="section-kicker">Reception desk</p><h1>Reception workspace</h1><span>Manage patient feedback and your account.</span></div></header><section className="admin-panel"><h2>Patient reviews</h2><Link to="/staff/reviews">Open reviews</Link></section></div></StaffLayout>;
};
export default ReceptionWorkspace;
