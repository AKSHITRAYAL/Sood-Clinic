import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Link, NavLink } from 'react-router-dom';
import { auth } from '../lib/firebase';
import PatientAvatar from './PatientAvatar';
import SoodClinicMark from './SoodClinicMark';

const navClass = ({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`;

const Navbar = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState(undefined);
  useEffect(() => { document.body.style.overflow = menuOpen ? 'hidden' : 'auto'; return () => { document.body.style.overflow = 'auto'; }; }, [menuOpen]);
  useEffect(() => onAuthStateChanged(auth, (next) => setUser(next || null)), []);
  const profileDestination = user ? '/patient' : '/login';
  const profileName = user?.displayName || user?.email?.split('@')[0] || 'Profile';

  return (
    <nav className="site-nav">
      <div className="site-nav__inner container mx-auto flex w-full items-center justify-between px-4">
        <Link to="/" aria-label="Sood Clinic home"><SoodClinicMark /></Link>
        <button type="button" onClick={() => setMenuOpen((open) => !open)} className={`mobile-menu-button lg:hidden${menuOpen ? ' mobile-menu-button--open' : ''}`} aria-label="Toggle navigation" aria-expanded={menuOpen}><span /><span /><span /></button>
        <div className="hidden items-center gap-2 lg:flex">
          <NavLink to="/" className={navClass}>Home</NavLink>
          <NavLink to="/About" className={navClass}>About us</NavLink>
          <NavLink to="/contact" className={navClass}>Contact</NavLink>
          <Link to={profileDestination} className="nav-profile" aria-label={user ? `Open ${profileName}'s profile` : 'Sign in or create a patient account'}>{user ? <><PatientAvatar name={profileName} photoUrl={user.photoURL} /><span>{profileName.split(' ')[0]}</span></> : <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.25" /><path d="M5.5 20c.65-3.4 2.75-5.1 6.5-5.1s5.85 1.7 6.5 5.1" /></svg>}</Link>
          <NavLink to="/Booknow" className="nav-cta">Book appointment</NavLink>
        </div>
      </div>
      {menuOpen && <div className="mobile-nav lg:hidden">
        <p className="mobile-nav__label">Sood Clinic</p>
        <div className="mobile-nav__links">
          <NavLink onClick={() => setMenuOpen(false)} to="/" className={navClass}>Home</NavLink>
          <NavLink onClick={() => setMenuOpen(false)} to="/About" className={navClass}>About us</NavLink>
          <NavLink onClick={() => setMenuOpen(false)} to="/contact" className={navClass}>Contact</NavLink>
          <Link onClick={() => setMenuOpen(false)} to={profileDestination} className="nav-link">{user ? 'My profile' : 'Sign in or sign up'}</Link>
        </div>
        <NavLink onClick={() => setMenuOpen(false)} to="/Booknow" className="mobile-nav__cta">Book appointment <span aria-hidden="true">→</span></NavLink>
      </div>}
    </nav>
  );
};
export default Navbar;
