import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import SoodClinicMark from './SoodClinicMark';

const navClass = ({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`;

const Navbar = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { document.body.style.overflow = menuOpen ? 'hidden' : 'auto'; return () => { document.body.style.overflow = 'auto'; }; }, [menuOpen]);

  return (
    <nav className="site-nav">
      <div className="site-nav__inner container mx-auto flex w-full items-center justify-between px-4">
        <Link to="/" aria-label="Sood Clinic home"><SoodClinicMark /></Link>
        <button type="button" onClick={() => setMenuOpen((open) => !open)} className={`mobile-menu-button lg:hidden${menuOpen ? ' mobile-menu-button--open' : ''}`} aria-label="Toggle navigation" aria-expanded={menuOpen}><span /><span /><span /></button>
        <div className="hidden items-center gap-2 lg:flex">
          <NavLink to="/" className={navClass}>Home</NavLink>
          <NavLink to="/About" className={navClass}>About us</NavLink>
          <NavLink to="/contact" className={navClass}>Contact</NavLink>
          <Link to="/login" className="nav-link">Sign in</Link>
          <NavLink to="/Booknow" className="nav-cta">Book appointment</NavLink>
        </div>
      </div>
      {menuOpen && <div className="mobile-nav lg:hidden">
        <p className="mobile-nav__label">Sood Clinic</p>
        <div className="mobile-nav__links">
          <NavLink onClick={() => setMenuOpen(false)} to="/" className={navClass}>Home</NavLink>
          <NavLink onClick={() => setMenuOpen(false)} to="/About" className={navClass}>About us</NavLink>
          <NavLink onClick={() => setMenuOpen(false)} to="/contact" className={navClass}>Contact</NavLink>
          <Link onClick={() => setMenuOpen(false)} to="/login" className="nav-link">Sign in</Link>
        </div>
        <NavLink onClick={() => setMenuOpen(false)} to="/Booknow" className="mobile-nav__cta">Book appointment <span aria-hidden="true">→</span></NavLink>
      </div>}
    </nav>
  );
};
export default Navbar;
