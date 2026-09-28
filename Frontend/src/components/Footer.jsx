import { Link } from 'react-router-dom';

const Footer = () => (
  <footer className="site-footer">
    <div className="site-footer__inner">
      <p className="site-footer__address"><strong>Sood Clinic</strong><span aria-hidden="true"> · </span>House No. 398, Sector 10, Panchkula, Haryana 134109</p>
      <nav className="site-footer__links" aria-label="Footer navigation">
        <Link to="/">Home</Link><Link to="/About">About</Link><Link to="/contact">Contact</Link><Link to="/Booknow">Book appointment</Link><Link className="site-footer__staff" to="/staff/login">Staff access</Link>
      </nav>
    </div>
  </footer>
);

export default Footer;
