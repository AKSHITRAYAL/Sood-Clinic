import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import About from '../pages/About';
import Bookappointment from '../pages/Bookappointment';
import Contact from '../pages/Contact';
import Home from '../pages/Home';
import Login from '../pages/Login';
import PasswordReset from '../pages/PasswordReset';
import PatientPortal from '../pages/PatientPortal';
import { staffUrl } from '../lib/portals';

const StaffRedirect = () => { window.location.replace(staffUrl('/staff')); return null; };

const PublicApp = () => <BrowserRouter><Routes>
  <Route path="/" element={<Home />} />
  <Route path="/about" element={<About />} />
  <Route path="/contact" element={<Contact />} />
  <Route path="/Booknow" element={<Bookappointment />} />
  <Route path="/login" element={<Login />} />
  <Route path="/reset-password" element={<PasswordReset />} />
  <Route path="/patient" element={<PatientPortal view="overview" />} />
  <Route path="/patient/appointments" element={<PatientPortal view="appointments" />} />
  <Route path="/patient/documents" element={<PatientPortal view="documents" />} />
  <Route path="/patient/health" element={<PatientPortal view="health" />} />
  <Route path="/patient/account" element={<PatientPortal view="profile" />} />
  <Route path="/patient/security" element={<PatientPortal view="security" />} />
  <Route path="/staff/*" element={<StaffRedirect />} />
  <Route path="/doctor/schedule" element={<StaffRedirect />} />
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes></BrowserRouter>;

export default PublicApp;
