import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import About from '../pages/About';
import AccountSettings from '../pages/AccountSettings';
import Bookappointment from '../pages/Bookappointment';
import Contact from '../pages/Contact';
import Home from '../pages/Home';
import Login from '../pages/Login';
import PasswordReset from '../pages/PasswordReset';
import PatientPortal from '../pages/PatientPortal';

const STAFF_ORIGIN = import.meta.env.VITE_STAFF_ORIGIN || 'https://sood-clinic-staff.web.app';
const StaffRedirect = () => { window.location.replace(`${STAFF_ORIGIN}/staff/login`); return null; };

const PublicApp = () => <BrowserRouter><Routes>
  <Route path="/" element={<Home />} />
  <Route path="/about" element={<About />} />
  <Route path="/contact" element={<Contact />} />
  <Route path="/Booknow" element={<Bookappointment />} />
  <Route path="/login" element={<Login />} />
  <Route path="/reset-password" element={<PasswordReset />} />
  <Route path="/patient" element={<PatientPortal />} />
  <Route path="/patient/account" element={<AccountSettings />} />
  <Route path="/staff/*" element={<StaffRedirect />} />
  <Route path="/doctor/schedule" element={<Navigate to="/staff/login" replace />} />
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes></BrowserRouter>;

export default PublicApp;
