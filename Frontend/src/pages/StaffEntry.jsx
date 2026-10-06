import { Link } from 'react-router-dom';
import { publicUrl } from '../lib/portals';

const StaffEntry = () => {
  return <main className="staff-entry">
    <header className="staff-entry__topbar"><strong>SOOD CLINIC</strong><a href={publicUrl('/')}>Public website</a></header>
    <section className="staff-entry__hero">
      <p>SOOD CLINIC · INTERNAL ACCESS</p>
      <h1>Care operations,<br />kept focused.</h1>
      <span>One private workspace for clinic administration, consultations and reception. Use your assigned work account to continue.</span>
      <div><Link to="/staff/login">Staff sign in</Link><small>Access is limited to authorised clinic personnel.</small></div>
    </section>
    <section className="staff-entry__roles" aria-label="Staff workspaces"><article><strong>Administration</strong><span>Manage staff access and clinic oversight.</span></article><article><strong>Clinical calendar</strong><span>Set availability and manage consultations.</span></article><article><strong>Reception</strong><span>Coordinate visits and patient documents.</span></article></section>
  </main>;
};

export default StaffEntry;
