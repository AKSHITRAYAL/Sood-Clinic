import { useState } from 'react';
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { Link, useNavigate } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { auth, authReady, functions } from '../lib/firebase';
import { hasStrongPassword, passwordPolicyMessage } from '../lib/passwordPolicy';
import PasswordRequirements from '../components/PasswordRequirements';

const staffRoles = ['admin', 'doctor', 'manager', 'receptionist'];
const errorMessage = (error) => ({
  'auth/email-already-in-use': 'An account already exists for this email. Please sign in instead.',
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/weak-password': passwordPolicyMessage,
  'clinic/weak-password': passwordPolicyMessage,
  'auth/user-not-found': 'Email or password is incorrect.',
  'auth/too-many-requests': 'Too many attempts. Please wait and try again later.',
  'auth/network-request-failed': 'Could not reach the sign-in service. Check your connection and try again.',
  'auth/unauthorized-continue-uri': 'The verification link could not be sent because this website is not configured for email verification. Please contact the clinic.',
}[error?.code] || 'We could not complete that request. Please check the details and try again.');

const Login = () => {
  const [mode, setMode] = useState('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const navigate = useNavigate();

  const submit = async (event) => {
    event.preventDefault(); setError(''); setMessage(''); setCanResend(false); setLoading(true);
    try {
      await authReady;
      if (mode === 'create') {
        if (!hasStrongPassword(password)) throw Object.assign(new Error(passwordPolicyMessage), { code: 'clinic/weak-password' });
        const result = await createUserWithEmailAndPassword(auth, email.trim(), password);
        try {
          await updateProfile(result.user, { displayName: name.trim() });
          await sendEmailVerification(result.user);
          setMessage('Verification email requested. Check your inbox and spam folder, then sign in.');
        } catch (caught) {
          setError(`Your account was created, but the verification email could not be sent. ${errorMessage(caught)}`);
          setCanResend(true);
        } finally {
          await auth.signOut();
          setMode('sign-in');
        }
      } else {
        const result = await signInWithEmailAndPassword(auth, email.trim(), password);
        const token = await result.user.getIdTokenResult(true);
        if (staffRoles.includes(token.claims.role)) {
          await auth.signOut();
          setError('This is a staff account. Please use the private staff sign-in page.');
        } else if (!result.user.emailVerified) {
          await auth.signOut();
          setCanResend(true);
          setError('Verify your email before signing in. Check your inbox and spam folder, or request another verification email.');
        } else {
          await httpsCallable(functions, 'registerPatientProfile')({ displayName: result.user.displayName || '' });
          navigate('/patient');
        }
      }
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setLoading(false); }
  };

  const resend = async () => {
    setLoading(true); setError(''); setMessage('');
    let signedIn = false;
    try {
      await authReady;
      const result = await signInWithEmailAndPassword(auth, email.trim(), password);
      signedIn = true;
      const token = await result.user.getIdTokenResult(true);
      if (staffRoles.includes(token.claims.role)) {
        setCanResend(false);
        setError('This is a staff account. Please use the private staff sign-in page.');
      } else if (result.user.emailVerified) {
        setCanResend(false);
        setMessage('Your email is verified. Sign in to continue.');
      } else {
        await sendEmailVerification(result.user);
        setMessage('Verification email requested. Check your inbox and spam folder, then sign in.');
      }
    } catch (caught) { setError(errorMessage(caught)); }
    finally {
      if (signedIn) await auth.signOut();
      setLoading(false);
    }
  };

  return <><Navbar /><main className="patient-auth"><form onSubmit={submit} className="patient-auth__card"><p>SOOD CLINIC PATIENT PORTAL</p><h1>{mode === 'create' ? 'Create your patient account' : 'Sign in'}</h1><span>Access your profile, appointment history and private medical records.</span>{mode === 'create' && <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" /></label>}<label>Email address<input type="email" value={email} onChange={(event) => { setEmail(event.target.value); setCanResend(false); }} required autoComplete="email" /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={mode === 'create' ? 8 : 6} autoComplete={mode === 'create' ? 'new-password' : 'current-password'} /></label>{mode === 'create' && <PasswordRequirements password={password} />}{error && <div className="staff-login__error" role="alert">{error}</div>}{message && <div className="patient-auth__message" role="status">{message}</div>}{canResend && <button type="button" disabled={loading || !email.trim() || !password} onClick={resend}>Resend verification email</button>}<button type="submit" disabled={loading}>{loading ? 'Please wait…' : mode === 'create' ? 'Create patient account' : 'Sign in securely'}</button><div className="patient-auth__links">{mode !== 'sign-in' && <button type="button" onClick={() => { setMode('sign-in'); setError(''); setMessage(''); setCanResend(false); }}>Back to sign in</button>}{mode === 'sign-in' && <><Link to="/reset-password">Forgot password?</Link><span>Don’t have an account? <button type="button" onClick={() => { setMode('create'); setError(''); setMessage(''); setCanResend(false); }}>Sign up</button></span></>}</div></form></main><Footer /></>;
};
export default Login;
