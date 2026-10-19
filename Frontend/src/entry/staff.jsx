import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AppErrorBoundary from '../components/AppErrorBoundary';
import StaffSessionGuard from '../components/StaffSessionGuard';
import { StaffAccessProvider, StaffRoute } from '../components/StaffAccessProvider';

const AccountSettings = lazy(() => import('../pages/AccountSettings'));
const DoctorSchedule = lazy(() => import('../pages/DoctorSchedule'));
const ManagerWorkspace = lazy(() => import('../pages/ManagerWorkspace'));
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

const StaffApp = () => <BrowserRouter><AppErrorBoundary staff><StaffSessionGuard><StaffAccessProvider><Suspense fallback={<RouteLoading />}><Routes>
  <Route path="/" element={<StaffEntry />} />
  <Route path="/staff" element={<StaffEntry />} />
  <Route path="/staff/login" element={<StaffLogin />} />
  <Route element={<StaffRoute allowPasswordChange />}>
    <Route path="/staff/account" element={<AccountSettings staff />} />
  </Route>
  <Route element={<StaffRoute role="admin" />}>
  <Route path="/staff/admin" element={<StaffAdmin />} />
  <Route path="/staff/admin/access" element={<StaffAccess />} />
  <Route path="/staff/admin/patients" element={<AdminPatients />} />
  <Route path="/staff/admin/audit" element={<AdminAudit />} />
  <Route path="/staff/admin/catalogue" element={<AdminCatalogue />} />
  <Route path="/staff/admin/feedback" element={<AdminFeedback />} />
  <Route path="/staff/admin/visit-types" element={<AdminVisitTypes />} />
  </Route>
  <Route element={<StaffRoute />}><Route path="/staff/video" element={<VideoConsultations />} /></Route>
  <Route element={<StaffRoute role="doctor" />}><Route path="/staff/doctor" element={<DoctorSchedule />} /></Route>
  <Route element={<StaffRoute role="manager" />}><Route path="/staff/manager" element={<ManagerWorkspace />} /></Route>
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes></Suspense></StaffAccessProvider></StaffSessionGuard></AppErrorBoundary></BrowserRouter>;

export default StaffApp;
