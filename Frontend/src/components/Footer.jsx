import { Link } from 'react-router-dom';
import { CLINIC_EMAIL, CLINIC_PHONE_DISPLAY, CLINIC_PHONE_TEL } from '../lib/clinicContact';

const Footer = () => (
  <footer className="site-footer">
    <div className="site-footer__inner">
      <p className="site-footer__address"><strong>Sood Clinic</strong><span aria-hidden="true"> · </span>House No. 398, Sector 10, Panchkula, Haryana 134109</p>
      <p className="site-footer__contact"><a href={`tel:${CLINIC_PHONE_TEL}`}>{CLINIC_PHONE_DISPLAY}</a><span aria-hidden="true"> · </span><a href={`mailto:${CLINIC_EMAIL}`}>{CLINIC_EMAIL}</a></p>
      <nav className="site-footer__links" aria-label="Footer navigation">
        <Link to="/">Home</Link><Link to="/About">About</Link><Link to="/guides">Health guides</Link><Link to="/experience">Patient experience</Link><Link to="/contact">Contact</Link><Link to="/book">Book appointment</Link><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link>
      </nav>
    </div>
  </footer>
);

export default Footer;
