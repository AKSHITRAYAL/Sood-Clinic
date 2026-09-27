import React from 'react';
import { Navigate } from 'react-router-dom';
// import Dash from "./dashboard";
import Home from './Home';
import Doctorpanel from './Doctorpanel'
import Admin from './adminpanel';
import Receptionistpanel from './Receptionistpanel';
// import Admincah from './admin/admincashy';


const AdminRoute = ({ children }) => {
  const token = localStorage.getItem('admintoken');
  if (!token) {
    return <Navigate to="/login" />;
  }

  return children;
};

const DoctorRoute = ({ children }) => {
  const token = localStorage.getItem('doctoken');
  if (!token) {
    return <Navigate to="/login" />;
  }

  return children;
};
const ReceptionistRoute = ({ children }) => {
  const token = localStorage.getItem('reptoken');
  if (!token) {
    return <Navigate to="/login" />;
  }

  return children;
};
const Adminchk = () => {
  const token = localStorage.getItem('admintoken');
  const token2 = localStorage.getItem('doctoken')
  const token3 = localStorage.getItem('reptoken')
  if (token) {
    return <Admin />;
  }
  else if (token2) {
    return <Doctorpanel />;


  }else if (token3){
    return <Receptionistpanel />;

  }
   else {
    return <Home />;

  }

};

const Homechk = () => {

  const token = localStorage.getItem('token');

  if (token) {

    return <div>LOading..</div>;
  }
  else {

    return <Home />;

  }

};

export { Homechk, Adminchk, AdminRoute,DoctorRoute,ReceptionistRoute };
