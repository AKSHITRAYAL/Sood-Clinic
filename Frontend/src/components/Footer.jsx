import { Link } from 'react-router-dom';
import SoodClinicMark from './SoodClinicMark';

const Footer = () => (
  <footer className="border-t-2 text-gray-700">
    <div className="container mx-auto flex flex-col flex-wrap px-5 py-16 md:flex-row md:items-start">
      <div className="w-72 text-center md:text-left">
        <Link to="/" className="inline-flex" aria-label="Sood Clinic home"><SoodClinicMark /></Link>
        <p className="mt-4 text-sm leading-6">Sood Clinic · House No. 398, Sector 10, Panchkula, Haryana 134109.</p>
      </div>
      <div className="mt-10 flex flex-1 flex-col gap-4 text-center md:mt-0 md:pl-20 md:text-left">
        <h2 className="text-sm font-medium uppercase tracking-widest">Clinic links</h2>
        <nav className="flex flex-col gap-3">
          <Link to="/">Home</Link>
          <Link to="/About">About Sood Clinic</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/Booknow">Book an appointment</Link>
        </nav>
      </div>
    </div>
  </footer>
);

export default Footer;
