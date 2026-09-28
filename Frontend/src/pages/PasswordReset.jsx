import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { Link, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { auth } from '../lib/firebase';

const PasswordReset = () => {
  const staff = new URLSearchParams(useLocation().search).get('staff') === '1';
  const [email, setEmail] = useState(''); const [sent, setSent] = useState(false); const [error, setError] = useState(false); const destination = staff ? '/staff/login' : '/login';
  const submit = async (event) => { event.preventDefault(); setError(false); try { await sendPasswordResetEmail(auth, email.trim()); setSent(true); } catch { setError(true); } };
  const card = <form className="patient-auth__card reset-card" onSubmit={submit}><p>{staff ? 'SOOD CLINIC · STAFF ACCESS' : 'SOOD CLINIC PATIENT PORTAL'}</p><h1>Reset password</h1><span>Enter your registered email and we’ll send you a secure link to create a new password.</span><label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" placeholder="name@example.com" /></label>{sent && <div className="patient-auth__message" role="status">If an account exists for this email, a password-reset link is on its way.</div>}{error && <div className="staff-login__error" role="alert">We could not send the reset email. Check the address and try again.</div>}<button type="submit">Send reset link</button><Link className="reset-card__back" to={destination}>← Back to sign in</Link></form>;
  return staff ? <main className="staff-auth">{card}</main> : <><Navbar /><main className="patient-auth">{card}</main></>;
};
export default PasswordReset;
