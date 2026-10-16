import { Link } from 'react-router-dom';
import { publicUrl } from '../lib/portals';

const StaffEntry = () => {
  return <main className="staff-auth">
    <section className="staff-login__card staff-entry__card">
      <p>SOOD CLINIC STAFF</p>
      <h1>Staff access</h1>
      <span>Sign in with your assigned clinic account to access your workspace.</span>
      <Link className="staff-entry__sign-in" to="/staff/login">Staff sign in</Link>
      <a className="staff-entry__public-link" href={publicUrl('/')}>Go to public website</a>
      <small>Access is limited to authorised clinic personnel.</small>
    </section>
  </main>;
};

export default StaffEntry;
