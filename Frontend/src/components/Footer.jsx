import { appointmentPhone, doctorEmail } from '../lib/clinicLocations';

const Footer = () => (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <p className="site-footer__address"><strong>Sood Clinic</strong><span aria-hidden="true"> · </span><a href={`tel:${appointmentPhone.replaceAll(' ', '')}`}>{appointmentPhone}</a><span aria-hidden="true"> · </span><a href={`mailto:${doctorEmail}`}>{doctorEmail}</a></p>
      </div>
    </footer>
);

export default Footer;
