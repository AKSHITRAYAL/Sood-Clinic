import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import menu from '../assets/svgs/menu.svg';
import cross from '../assets/images/cross.png';
import SoodClinicMark from './SoodClinicMark';

const navClass = ({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`;

const Navbar = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const token = localStorage.getItem('admintoken');
  useEffect(() => { document.body.style.overflow = menuOpen ? 'hidden' : 'auto'; return () => { document.body.style.overflow = 'auto'; }; }, [menuOpen]);
  const logout = () => { localStorage.removeItem('admintoken'); window.location.reload(); };

  return (
    <nav className="site-nav">
      <div className="site-nav__inner container mx-auto flex w-full items-center justify-between px-4">
        <Link to="/" aria-label="Sood Clinic home"><SoodClinicMark /></Link>
        <button type="button" onClick={() => setMenuOpen((open) => !open)} className="h-10 w-10 md:hidden" aria-label="Toggle navigation"><img src={menuOpen ? cross : menu} width={25} height={25} alt="" /></button>
        <div className="hidden items-center gap-2 md:flex">
          <NavLink to="/" className={navClass}>Home</NavLink>
          <NavLink to="/About" className={navClass}>About us</NavLink>
          <NavLink to="/contact" className={navClass}>Contact</NavLink>
          {token ? <button type="button" onClick={logout} className="nav-cta">Log out</button> : <Link to="/login" className="nav-link">Staff login</Link>}
          <NavLink to="/Booknow" className="nav-cta">Book appointment</NavLink>
        </div>
      </div>
      {menuOpen && <div className="mobile-nav absolute left-0 top-full flex w-full flex-col p-3 md:hidden">
        <NavLink onClick={() => setMenuOpen(false)} to="/" className={navClass}>Home</NavLink>
        <NavLink onClick={() => setMenuOpen(false)} to="/About" className={navClass}>About us</NavLink>
        <NavLink onClick={() => setMenuOpen(false)} to="/contact" className={navClass}>Contact</NavLink>
        <NavLink onClick={() => setMenuOpen(false)} to="/Booknow" className="nav-cta mt-2 text-center">Book appointment</NavLink>
      </div>}
    </nav>
  );
};
export default Navbar;
