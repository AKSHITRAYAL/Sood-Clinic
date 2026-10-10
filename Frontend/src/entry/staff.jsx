import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppErrorBoundary from '../components/AppErrorBoundary';
import StaffSessionGuard from '../components/StaffSessionGuard';

const AccountSettings = lazy(() => import('../pages/AccountSettings'));
const DoctorSchedule = lazy(() => import('../pages/DoctorSchedule'));
const ReceptionWorkspace = lazy(() => import('../pages/ReceptionWorkspace'));
const StaffAdmin = lazy(() => import('../pages/StaffAdmin'));
const StaffAccess = lazy(() => import('../pages/StaffAccess'));
const AdminPatients = lazy(() => import('../pages/AdminPatients'));
const AdminAudit = lazy(() => import('../pages/AdminAudit'));
const AdminCatalogue = lazy(() => import('../pages/AdminCatalogue'));
const AdminFeedback = lazy(() => import('../pages/AdminFeedback'));
const AdminVisitTypes = lazy(() => import('../pages/AdminVisitTypes'));
const VideoConsultations = lazy(() => import('../pages/VideoConsultations'));
const StaffEntry = lazy(() => import('../pages/StaffEntry'));
const StaffLogin = lazy(() => import('../pages/StaffLogin'));
const RouteLoading = () => <main className="route-loading route-loading--staff" aria-live="polite">Loading secure workspace…</main>;

const StaffApp = () => <BrowserRouter><AppErrorBoundary staff><StaffSessionGuard><Suspense fallback={<RouteLoading />}><Routes>
  <Route path="/" element={<StaffEntry />} />
  <Route path="/staff" element={<StaffEntry />} />
  <Route path="/staff/login" element={<StaffLogin />} />
  <Route path="/staff/account" element={<AccountSettings staff />} />
  <Route path="/staff/admin" element={<StaffAdmin />} />
  <Route path="/staff/admin/access" element={<StaffAccess />} />
  <Route path="/staff/admin/patients" element={<AdminPatients />} />
  <Route path="/staff/admin/audit" element={<AdminAudit />} />
  <Route path="/staff/admin/catalogue" element={<AdminCatalogue />} />
  <Route path="/staff/admin/feedback" element={<AdminFeedback />} />
  <Route path="/staff/admin/visit-types" element={<AdminVisitTypes />} />
  <Route path="/staff/video" element={<VideoConsultations />} />
  <Route path="/staff/doctor" element={<DoctorSchedule />} />
  <Route path="/staff/reception" element={<ReceptionWorkspace />} />
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes></Suspense></StaffSessionGuard></AppErrorBoundary></BrowserRouter>;

export default StaffApp;
