import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useStaffAccess } from '../lib/staffSessionContext';
import { publicUrl } from '../lib/portals';
import SoodClinicMark from './SoodClinicMark';
import './staffLayout.css';

const homeByRole = { admin: '/staff/admin', doctor: '/staff/doctor', manager: '/staff/manager', receptionist: '/staff/receptionist' };
const menuByRole = {
  admin: [['/staff/admin', 'Overview'], ['/staff/admin/patients', 'Patients'], ['/staff/appointments', 'Appointment board'], ['/staff/admin/catalogue', 'Booking setup'], ['/staff/admin/visit-types', 'Visit formats'], ['/staff/requests', 'Requests'], ['/staff/video', 'Video visits'], ['/staff/reviews', 'Reviews'], ['/staff/admin/access', 'Staff access'], ['/staff/admin/audit', 'Activity']],
  doctor: [['/staff/doctor', 'Calendar'], ['/staff/appointments', 'Appointment board'], ['/staff/requests', 'Requests'], ['/staff/video', 'Video visits']],
  manager: [['/staff/manager', 'Appointments'], ['/staff/appointments', 'Appointment board'], ['/staff/requests', 'Requests'], ['/staff/video', 'Video visits'], ['/staff/reviews', 'Reviews']],
  receptionist: [['/staff/receptionist', 'Overview'], ['/staff/reviews', 'Reviews']],
};
export default function StaffLayout({ children }) {
  const { role, mustChangePassword } = useStaffAccess(); const { pathname } = useLocation();
  const [open, setOpen] = useState(false); const toggle = useRef(null);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const escape = event => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); } };
    window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape);
  }, [open]);
  const home = mustChangePassword ? '/staff/account' : homeByRole[role] || '/staff';
  const workspaceName = role === 'doctor' ? 'Doctor' : role === 'admin' ? 'Administrator' : role === 'manager' ? 'Manager' : 'Receptionist';
  return <main className="staff-shell staff-layout">
    <button type="button" className={`staff-sidebar__backdrop${open ? ' is-visible' : ''}`} aria-label="Close staff navigation" onClick={() => setOpen(false)} />
    <aside className={`staff-sidebar${open ? ' is-open' : ''}`} aria-label="Staff workspace navigation">
      <div className="staff-sidebar__mobile-head"><span>Menu</span><button type="button" onClick={() => setOpen(false)} aria-label="Close staff drawer">×</button></div>
      <Link to={home} className="staff-sidebar__brand" aria-label="Sood Clinic workspace"><SoodClinicMark /></Link>
      <div className="staff-sidebar__person"><strong>{workspaceName}</strong><span>Staff workspace</span></div>
      {!mustChangePassword && <><span className="staff-sidebar__nav-label">Workspace</span><nav id="staff-navigation" aria-label="Staff navigation">
        {(menuByRole[role] || []).map(([path, label]) => <NavLink key={path} to={path} end={path === homeByRole[role]} className={({ isActive }) => `staff-sidebar__link${isActive ? ' is-active' : ''}`}>{label}</NavLink>)}
      </nav></>}
      <div className="staff-sidebar__bottom"><NavLink className={({ isActive }) => `staff-sidebar__link${isActive ? ' is-active' : ''}`} to="/staff/account">My account</NavLink>{!mustChangePassword && <a className="staff-sidebar__link" href={publicUrl('/')}>Public website</a>}<button className="staff-sidebar__link" type="button" onClick={() => signOut(auth)}>Sign out</button></div>
    </aside>
    <div className="staff-layout__content"><header className="staff-layout__topbar"><div><p>SOOD CLINIC</p><span>{workspaceName} portal</span></div><button ref={toggle} type="button" className="staff-layout__toggle" aria-expanded={open} aria-controls="staff-navigation" onClick={() => setOpen(value => !value)}>{open ? 'Close menu' : 'Menu'} <span aria-hidden="true">{open ? '×' : '☰'}</span></button></header><div className="staff-layout__body">{children}</div></div>
  </main>;
}
StaffLayout.propTypes = { children: PropTypes.node.isRequired };
