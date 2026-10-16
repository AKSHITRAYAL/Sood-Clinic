import { Link } from 'react-router-dom';
import PropTypes from 'prop-types';
import Footer from '../components/Footer';
import Navbar from '../components/Navbar';

const Legal = ({ type }) => {
  const privacy = type === 'privacy';
  return <><Navbar /><main className="content-page"><header className="content-page__header"><p className="section-kicker">Sood Clinic</p><h1>{privacy ? 'Privacy notice' : 'Terms of use'}</h1><p>Last updated: 14 October 2026</p></header><article className="content-page__body">{privacy ? <><h2>Information we collect</h2><p>When you request or manage an appointment, we collect the contact and appointment details needed to provide clinic services. Patient portal information is stored for the signed-in patient and authorised clinic staff.</p><h2>How we use information</h2><p>We use these details to schedule care, contact you about your appointment, maintain clinic records, and respond to support requests. We do not put diagnosis, notes, or other clinical text into marketing messages or third-party analytics.</p><h2>Your choices</h2><p>You may contact the clinic to ask about access, correction, or deletion of information. Identity verification may be required before a request is completed.</p><h2>Contact</h2><p>For privacy questions, call <a href="tel:+918988207797">89882 07797</a> or email <a href="mailto:Atulsooddr@gmail.com">Atulsooddr@gmail.com</a>.</p></> : <><h2>Appointments</h2><p>Appointment availability is subject to clinic schedule changes. A booking is confirmed only when the clinic system returns a booking reference. Please provide accurate contact details and contact the clinic if your circumstances change.</p><h2>Clinical care</h2><p>Online information is general guidance and is not a substitute for medical advice or emergency services. Call local emergency services for urgent concerns.</p><h2>Acceptable use</h2><p>Do not attempt to access another person’s account, bypass appointment controls, or submit information that you are not authorised to provide.</p><h2>Questions</h2><p>See our <Link to="/privacy">privacy notice</Link> or contact the clinic directly.</p></>}</article></main><Footer /></>;
};

Legal.propTypes = { type: PropTypes.oneOf(['privacy', 'terms']).isRequired };
export default Legal;
