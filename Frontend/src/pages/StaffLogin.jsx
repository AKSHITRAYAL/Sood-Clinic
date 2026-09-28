import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../lib/firebase';

const destinations = { admin: '/staff/admin', doctor: '/staff/doctor', receptionist: '/staff/reception' };
const StaffLogin = () => {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(false); const navigate = useNavigate();
  const submit = async (event) => { event.preventDefault(); setError(''); setLoading(true); try { const result = await signInWithEmailAndPassword(auth, email.trim(), password); const token = await result.user.getIdTokenResult(true); const destination = destinations[token.claims.role]; if (!destination) { await auth.signOut(); setError('This account is not assigned staff access.'); } else navigate(destination); } catch { setError('Unable to sign in. Check your email, password, and staff access.'); } finally { setLoading(false); } };
  return <main className="staff-auth"><form className="staff-login__card" onSubmit={submit}><p>SOOD CLINIC · STAFF ACCESS</p><h1>Staff sign in</h1><span>Secure access for administrators, doctors and reception.</span><label>Work email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label>{error && <div className="staff-login__error" role="alert">{error}</div>}<button type="submit" disabled={loading}>{loading ? 'Please wait…' : 'Sign in to staff workspace'}</button><div className="patient-auth__links"><Link to="/reset-password?staff=1">Forgot password?</Link></div><small className="patient-auth__staff-link"><Link to="/login">Patient portal</Link></small></form></main>;
};
export default StaffLogin;
