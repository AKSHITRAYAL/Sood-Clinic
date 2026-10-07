import { useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Link, NavLink } from 'react-router-dom';
import { auth } from '../lib/firebase';
import PatientAvatar from './PatientAvatar';
import SoodClinicMark from './SoodClinicMark';

const navClass = ({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`;

const Navbar = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [user, setUser] = useState(undefined);
  const closeButton = useRef(null);
  const closeMenu = () => setMenuOpen(false);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKeyDown = (event) => { if (event.key === 'Escape') closeMenu(); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    closeButton.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);
  useEffect(() => onAuthStateChanged(auth, (next) => setUser(next || null)), []);
  const profileDestination = user ? '/patient' : '/login';
  const profileName = user?.displayName || user?.email?.split('@')[0] || 'Profile';

  return (
    <nav className="site-nav">
      <div className="site-nav__inner container mx-auto flex w-full items-center justify-between px-4">
        <Link to="/" aria-label="Sood Clinic home"><SoodClinicMark /></Link>
        <div className="mobile-nav-controls lg:hidden">
          <Link to={profileDestination} className="mobile-profile-button" aria-label={user ? `Open ${profileName}'s profile` : 'Sign in or create a patient account'}>{user ? <PatientAvatar name={profileName} photoUrl={user.photoURL} /> : <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.25" /><path d="M5.5 20c.65-3.4 2.75-5.1 6.5-5.1s5.85 1.7 6.5 5.1" /></svg>}</Link>
          <button type="button" onClick={() => setMenuOpen((open) => !open)} className={`mobile-menu-button${menuOpen ? ' mobile-menu-button--open' : ''}`} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen}><span /><span /><span /></button>
        </div>
        <div className="hidden items-center gap-2 lg:flex">
          <NavLink to="/" className={navClass}>Home</NavLink>
          <NavLink to="/About" className={navClass}>About us</NavLink>
          <NavLink to="/contact" className={navClass}>Contact</NavLink>
          <Link to={profileDestination} className="nav-profile" aria-label={user ? `Open ${profileName}'s profile` : 'Sign in or create a patient account'}>{user ? <><PatientAvatar name={profileName} photoUrl={user.photoURL} /><span>{profileName.split(' ')[0]}</span></> : <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.25" /><path d="M5.5 20c.65-3.4 2.75-5.1 6.5-5.1s5.85 1.7 6.5 5.1" /></svg>}</Link>
          <NavLink to="/Booknow" className="nav-cta">Book appointment</NavLink>
        </div>
      </div>
      {menuOpen && <div className="mobile-nav-backdrop lg:hidden" onMouseDown={closeMenu}>
        <aside className="mobile-nav" role="dialog" aria-modal="true" aria-label="Website navigation" onMouseDown={(event) => event.stopPropagation()}>
          <header className="mobile-nav__header"><span>Menu</span><button ref={closeButton} type="button" onClick={closeMenu} aria-label="Close navigation">×</button></header>
          <Link onClick={closeMenu} to={profileDestination} className="mobile-nav__account">
            {user ? <PatientAvatar name={profileName} photoUrl={user.photoURL} className="patient-avatar--drawer" /> : <span className="mobile-nav__account-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.25" /><path d="M5.5 20c.65-3.4 2.75-5.1 6.5-5.1s5.85 1.7 6.5 5.1" /></svg></span>}
            <span><strong>{user ? profileName : 'Your patient account'}</strong><small>{user ? 'View profile and appointments' : 'Sign in or create an account'}</small></span><b aria-hidden="true">›</b>
          </Link>
          <nav className="mobile-nav__links" aria-label="Primary navigation">
            <p className="mobile-nav__label">Explore</p>
            <NavLink onClick={closeMenu} to="/" className={navClass}>Home</NavLink>
            <NavLink onClick={closeMenu} to="/About" className={navClass}>About us</NavLink>
            <NavLink onClick={closeMenu} to="/contact" className={navClass}>Contact</NavLink>
          </nav>
          <NavLink onClick={closeMenu} to="/Booknow" className="mobile-nav__cta">Book an appointment <span aria-hidden="true">→</span></NavLink>
          <p className="mobile-nav__footer">Sood Clinic · Panchkula</p>
        </aside>
      </div>}
    </nav>
  );
};
export default Navbar;
