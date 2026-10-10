import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppErrorBoundary from '../components/AppErrorBoundary';
import { staffUrl } from '../lib/portals';

const About = lazy(() => import('../pages/About'));
const Bookappointment = lazy(() => import('../pages/Bookappointment'));
const Contact = lazy(() => import('../pages/Contact'));
const Home = lazy(() => import('../pages/Home'));
const HealthGuides = lazy(() => import('../pages/HealthGuides'));
const PatientExperience = lazy(() => import('../pages/PatientExperience'));
const Login = lazy(() => import('../pages/Login'));
const PasswordReset = lazy(() => import('../pages/PasswordReset'));
const PatientPortal = lazy(() => import('../pages/PatientPortal'));
const RescheduleAppointment = lazy(() => import('../pages/RescheduleAppointment'));
const PublicNotFound = lazy(() => import('../pages/PublicNotFound'));
const StaffRedirect = () => { window.location.replace(staffUrl('/staff')); return null; };
const RouteLoading = () => <main className="route-loading" aria-live="polite">Loading…</main>;

const PublicApp = () => <BrowserRouter><AppErrorBoundary><Suspense fallback={<RouteLoading />}><Routes>
  <Route path="/" element={<Home />} />
  <Route path="/about" element={<About />} />
  <Route path="/contact" element={<Contact />} />
  <Route path="/guides" element={<HealthGuides />} />
  <Route path="/experience" element={<PatientExperience />} />
  <Route path="/book" element={<Bookappointment />} />
  <Route path="/Booknow" element={<Navigate to="/book" replace />} />
  <Route path="/login" element={<Login />} />
  <Route path="/reset-password" element={<PasswordReset />} />
  <Route path="/patient" element={<PatientPortal view="overview" />} />
  <Route path="/patient/appointments" element={<PatientPortal view="appointments" />} />
  <Route path="/patient/video" element={<PatientPortal view="video" />} />
  <Route path="/patient/appointments/:appointmentId/reschedule" element={<RescheduleAppointment />} />
  <Route path="/patient/documents" element={<PatientPortal view="documents" />} />
  <Route path="/patient/health" element={<PatientPortal view="health" />} />
  <Route path="/patient/account" element={<PatientPortal view="profile" />} />
  <Route path="/patient/security" element={<PatientPortal view="security" />} />
  <Route path="/staff/*" element={<StaffRedirect />} />
  <Route path="/doctor/schedule" element={<StaffRedirect />} />
  <Route path="*" element={<PublicNotFound />} />
</Routes></Suspense></AppErrorBoundary></BrowserRouter>;

export default PublicApp;
