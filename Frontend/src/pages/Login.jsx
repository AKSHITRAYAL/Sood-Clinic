import { useState } from 'react';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { Link, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { auth, authReady, functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

const Login = () => {
  const [mode, setMode] = useState('sign-in');
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const navigate = useNavigate();
  const submit = async (event) => {
    event.preventDefault(); setError(''); setMessage(''); setLoading(true);
    try {
      await authReady;
      if (mode === 'create') { const result = await createUserWithEmailAndPassword(auth, email.trim(), password); await updateProfile(result.user, { displayName: name.trim() }); await httpsCallable(functions, 'registerPatientProfile')({ displayName: name.trim() }); navigate('/patient'); }
      else { const result = await signInWithEmailAndPassword(auth, email.trim(), password); const token = await result.user.getIdTokenResult(true); if (['admin', 'doctor', 'receptionist'].includes(token.claims.role)) { await auth.signOut(); setError('This is a staff account. Please use the private staff sign-in page.'); } else navigate('/patient'); }
    } catch (caught) { const codes = { 'auth/email-already-in-use': 'An account already exists for this email. Please sign in instead.', 'auth/invalid-credential': 'Email or password is incorrect.', 'auth/weak-password': 'Use a password with at least six characters.', 'auth/user-not-found': 'No patient account was found for this email.' }; setError(codes[caught.code] || 'We could not complete that request. Please check the details and try again.'); } finally { setLoading(false); }
  };
  const heading = mode === 'create' ? 'Create your patient account' : 'Sign in';
  return <><Navbar /><main className="patient-auth"><form onSubmit={submit} className="patient-auth__card"><p>SOOD CLINIC PATIENT PORTAL</p><h1>{heading}</h1><span>Access your profile, appointment history and private medical records.</span>{mode === 'create' && <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" /></label>}<label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength="6" autoComplete={mode === 'create' ? 'new-password' : 'current-password'} /></label>{error && <div className="staff-login__error" role="alert">{error}</div>}{message && <div className="patient-auth__message" role="status">{message}</div>}<button type="submit" disabled={loading}>{loading ? 'Please wait…' : mode === 'create' ? 'Create patient account' : 'Sign in securely'}</button><div className="patient-auth__links">{mode !== 'sign-in' && <button type="button" onClick={() => { setMode('sign-in'); setError(''); setMessage(''); }}>Back to sign in</button>}{mode === 'sign-in' && <><Link to="/reset-password">Forgot password?</Link><span>Don’t have an account? <button type="button" onClick={() => { setMode('create'); setError(''); }}>Sign up</button></span></>}</div></form></main><Footer /></>;
};
export default Login;
