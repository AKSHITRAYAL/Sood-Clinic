import { clinicPhones, doctorEmail } from '../lib/clinicLocations';

const Footer = () => (
  <footer className="site-footer">
    <div className="site-footer__inner">
      <p className="site-footer__address">
        <strong>Sood Clinic</strong>
        {clinicPhones.map((phone) => (
          <span key={phone.tel}>
            <span aria-hidden="true"> · </span>
            <a href={`tel:${phone.tel}`}>{phone.display}</a>
          </span>
        ))}
        <span aria-hidden="true"> · </span>
        <a href={`mailto:${doctorEmail}`}>{doctorEmail}</a>
      </p>
    </div>
  </footer>
);

export default Footer;