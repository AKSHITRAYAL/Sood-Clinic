import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import AccountSettings from '../pages/AccountSettings';
import DoctorSchedule from '../pages/DoctorSchedule';
import ReceptionWorkspace from '../pages/ReceptionWorkspace';
import StaffAdmin from '../pages/StaffAdmin';
import StaffEntry from '../pages/StaffEntry';
import StaffLogin from '../pages/StaffLogin';

const StaffApp = () => <BrowserRouter><Routes>
  <Route path="/staff" element={<StaffEntry />} />
  <Route path="/staff/login" element={<StaffLogin />} />
  <Route path="/staff/account" element={<AccountSettings staff />} />
  <Route path="/staff/admin" element={<StaffAdmin />} />
  <Route path="/staff/doctor" element={<DoctorSchedule />} />
  <Route path="/staff/reception" element={<ReceptionWorkspace />} />
  <Route path="*" element={<Navigate to="/staff/login" replace />} />
</Routes></BrowserRouter>;

export default StaffApp;
