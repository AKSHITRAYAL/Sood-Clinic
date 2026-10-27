import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getClinicContact } from '../services/clinicProfileService';

// The clinic's public phone/email come from the published SQL contact record. The
// number is never hard-coded: an unavailable record must not invent contact detail.
const Footer = () => {
  const [contact, setContact] = useState(null);
  useEffect(() => {
    let cancelled = false;
    getClinicContact().then((result) => { if (!cancelled) setContact(result); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p className="site-footer__address"><strong>Sood Clinic</strong><span aria-hidden="true"> · </span>House No. 398, Sector 10, Panchkula, Haryana 134109</p>
        {contact
          ? <p className="site-footer__address"><a href={`tel:${contact.phone}`}>{contact.phone}</a><span aria-hidden="true"> · </span><a href={`mailto:${contact.email}`}>{contact.email}</a></p>
          : <p className="site-footer__address"><Link to="/contact">Clinic phone and email</Link></p>}
        <nav className="site-footer__links" aria-label="Footer navigation">
          <Link to="/">Home</Link><Link to="/About">About</Link><Link to="/guides">Health guides</Link><Link to="/experience">Patient experience</Link><Link to="/contact">Contact</Link><Link to="/book">Book appointment</Link>
        </nav>
      </div>
    </footer>
  );
};

export default Footer;
