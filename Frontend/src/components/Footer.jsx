import { Link } from 'react-router-dom';
import SoodClinicMark from './SoodClinicMark';

const Footer = () => (
  <footer className="site-footer">
    <div className="site-footer__inner">
      <Link to="/" className="site-footer__brand" aria-label="Sood Clinic home"><SoodClinicMark compact /></Link>
      <p className="site-footer__address">House No. 398, Sector 10, Panchkula, Haryana 134109</p>
      <nav className="site-footer__links" aria-label="Footer navigation">
        <Link to="/">Home</Link><Link to="/About">About</Link><Link to="/contact">Contact</Link><Link to="/Booknow">Book appointment</Link>
      </nav>
    </div>
  </footer>
);

export default Footer;
