import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import About from './pages/About';
import AccountSettings from './pages/AccountSettings';
import Bookappointment from './pages/Bookappointment';
import Contact from './pages/Contact';
import DoctorSchedule from './pages/DoctorSchedule';
import Home from './pages/Home';
import Login from './pages/Login';
import PasswordReset from './pages/PasswordReset';
import PatientPortal from './pages/PatientPortal';
import ReceptionWorkspace from './pages/ReceptionWorkspace';
import StaffAdmin from './pages/StaffAdmin';
import StaffEntry from './pages/StaffEntry';
import StaffLogin from './pages/StaffLogin';

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/Booknow" element={<Bookappointment />} />

      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<PasswordReset />} />
      <Route path="/patient" element={<PatientPortal />} />
      <Route path="/patient/account" element={<AccountSettings />} />

      <Route path="/staff" element={<StaffEntry />} />
      <Route path="/staff/login" element={<StaffLogin />} />
      <Route path="/staff/account" element={<AccountSettings staff />} />
      <Route path="/staff/admin" element={<StaffAdmin />} />
      <Route path="/staff/doctor" element={<DoctorSchedule />} />
      <Route path="/staff/reception" element={<ReceptionWorkspace />} />

      <Route path="/doctor/schedule" element={<Navigate to="/staff/doctor" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </BrowserRouter>
);

export default App;
