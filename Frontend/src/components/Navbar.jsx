import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import menu from '../assets/svgs/menu.svg';
import cross from '../assets/images/cross.png';
import SoodClinicMark from './SoodClinicMark';
import { ModeToggle } from './ModeToggle';

const navClass = ({ isActive }) => (isActive
  ? 'bg-bb px-4 py-2 rounded-sm'
  : 'transition-all duration-300 ease-in-out hover:bg-bb px-4 py-2');

const Navbar = () => {
  const [menuOpen, setMenuOpen] = useState(false);
  const token = localStorage.getItem('admintoken');

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : 'auto';
    return () => { document.body.style.overflow = 'auto'; };
  }, [menuOpen]);

  const logout = () => {
    localStorage.removeItem('admintoken');
    window.location.reload();
  };

  return (
    <nav className="relative w-full bg-gg text-white">
      <div className="container mx-auto flex h-[90px] w-full items-center justify-between px-2">
        <Link to="/" className="flex h-full items-center rounded-br-[42px] border bg-white px-4" aria-label="Sood Clinic home"><SoodClinicMark /></Link>

        <button type="button" onClick={() => setMenuOpen((open) => !open)} className="h-10 w-10 lg:hidden md:hidden" aria-label="Toggle navigation">
          <img src={menuOpen ? cross : menu} width={25} height={25} className="transition-all duration-75" alt="" />
        </button>

        <div className="hidden items-center gap-5 md:flex lg:flex">
          <ul className="flex items-center gap-1 text-lg">
            <NavLink to="/" className={navClass}>Home</NavLink>
            <NavLink to="/About" className={navClass}>About</NavLink>
            <NavLink to="/contact" className={navClass}>Contact</NavLink>
            <NavLink to="/Booknow" className={navClass}>Book Appointment</NavLink>
          </ul>
          {token ? <button type="button" onClick={logout} className="rounded-full border px-5 py-2 hover:bg-bb">Log out</button> : <Link to="/login" className="rounded-3xl border-2 px-6 py-2 transition-all hover:border-bb hover:bg-bb">Staff login</Link>}
          <ModeToggle />
        </div>
      </div>

      {menuOpen && (
        <div className="absolute left-0 top-full z-10 flex w-full flex-col border-t bg-gg md:hidden lg:hidden">
          <NavLink onClick={() => setMenuOpen(false)} to="/" className="px-5 py-5 hover:bg-[#0098ac]">Home</NavLink>
          <NavLink onClick={() => setMenuOpen(false)} to="/About" className="px-5 py-5 hover:bg-[#0098ac]">About</NavLink>
          <NavLink onClick={() => setMenuOpen(false)} to="/contact" className="px-5 py-5 hover:bg-[#0098ac]">Contact</NavLink>
          <NavLink onClick={() => setMenuOpen(false)} to="/Booknow" className="px-5 py-5 hover:bg-[#0098ac]">Book Appointment</NavLink>
          {token ? <button type="button" onClick={logout} className="border-t px-5 py-5 text-left hover:bg-[#0098ac]">Log out</button> : <NavLink onClick={() => setMenuOpen(false)} to="/login" className="border-t px-5 py-5 hover:bg-[#0098ac]">Staff login</NavLink>}
        </div>
      )}
    </nav>
  );
};

export default Navbar;
