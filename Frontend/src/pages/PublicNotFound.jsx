import { Link } from 'react-router-dom';
import Footer from '../components/Footer';
import Navbar from '../components/Navbar';

const PublicNotFound = () => <><Navbar /><main className="site-not-found"><p className="section-kicker">404</p><h1>That page is not available.</h1><span>The link may be out of date, or the page may have moved.</span><div><Link to="/">Go to home</Link><Link className="staff-secondary-button" to="/book">Book an appointment</Link></div></main><Footer /></>;

export default PublicNotFound;
