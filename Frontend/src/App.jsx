import { useState } from 'react'

import { BrowserRouter, Routes, Route } from 'react-router-dom'
// Admin Essential Imports
import Setting from './pages/Admin_E/Setting'
import Edit from './pages/Admin_E/Edit'
import Viewadmin from './pages/Admin_E/Viewadmin'
import Doctor from './pages/Admin_E/Doctor/Doctor'
import Adddoctor from './pages/Admin_E/Doctor/Adddoctor'
import Doctoredit from './pages/Admin_E/Doctor/Doctoredit'
import View from './pages/Admin_E/Receptionist/View'
import REdit from './pages/Admin_E/Receptionist/Edit'
import RAdd from './pages/Admin_E/Receptionist/Add'
import Message from './pages/Admin_E/Message'
import Department from './pages/Admin_E/Department'
import Addadmin from './pages/Admin_E/Addadmin';
import Apointment from './pages/Admin_E/Apointment'
import About from './pages/About'
// Doctor Essential Imports
import DocSetting from './pages/Doctor_E/Setting'
import DocEdit from './pages/Doctor_E/Edit'
import DocDepartment from './pages/Doctor_E/Department'
import DocDoctor from './pages/Doctor_E/Doctor'
// Receptionist Essential Imports
import RepSetting from './pages/Receptionist_E/Setting'
import RepEdit from './pages/Receptionist_E/Edit'
import Receptionist from './pages/Receptionist_E/Receptionist'
import RepDepartment from './pages/Receptionist_E/Department'



// Public Essential Imports
import Bookappointment from './pages/Bookappointment'






import Contact from './pages/Contact'
import Rigister from './pages/Rigister'


import Login from './pages/Login'
// import Trail from './pages/trail'
// import FAQ from './pages/FAQ'
import { Homechk, Adminchk, AdminRoute, DoctorRoute, ReceptionistRoute } from './pages/Protectedroutes'
// import TopLoadingBar from './components/TopLoadingBar';

function App() {


  return (
    <>
      <BrowserRouter>

        {/* <TopLoadingBar /> */}
        <Routes>
          <Route path="/" element={
            <Adminchk />
          } />
          <Route path='/About' element={<About />} />
          <Route path='/login' element={<Login />} />

          {/* Admin Routes Start */}
          <Route path='/setting' element={
            <AdminRoute>
              <Setting />
            </AdminRoute>

          } />
          <Route path='/setting/edit' element={
            <AdminRoute>
              <Edit />
            </AdminRoute>

          } />
          <Route path='/setting/add' element={
            <AdminRoute>
              <Addadmin />
            </AdminRoute>

          } />
          <Route path='/setting/view' element={
            <AdminRoute>
              <Viewadmin />
            </AdminRoute>

          } />
          <Route path='/doctors' element={
            <AdminRoute>
              <Doctor />
            </AdminRoute>

          } />
          <Route path='/doctors/adddoctor' element={
            <AdminRoute>
              <Adddoctor />
            </AdminRoute>

          } />
          <Route path="/doctors/Editdoctor/:id" element={
            <AdminRoute>
              <Doctoredit />
            </AdminRoute>

          } />
          <Route path="/receptionist/Edit/:id" element={
            <AdminRoute>
              <REdit />
            </AdminRoute>

          } />
          <Route path='/receptionist/add' element={
            <AdminRoute>
              <RAdd />
            </AdminRoute>

          } />
          <Route path='/receptionist' element={
            <AdminRoute>
              <View />
            </AdminRoute>

          } />
          <Route path='/messages' element={
            <AdminRoute>
              <Message />
            </AdminRoute>

          } />
          <Route path='/department' element={
            <AdminRoute>
              <Department />
            </AdminRoute>

          } />
          <Route path='/appointment' element={
            <AdminRoute>
              <Apointment />
            </AdminRoute>

          } />

          {/* Doctor Routes Start */}
          <Route path='/doc/setting' element={
            <DoctorRoute>
              <DocSetting />
            </DoctorRoute>

          } />
          <Route path='/doc/setting/edit' element={
            <DoctorRoute>
              <DocEdit />
            </DoctorRoute>

          } />
          <Route path='/doc/department' element={
            <DoctorRoute>
              <DocDepartment />
            </DoctorRoute>

          } />

          <Route path='/doc/Doctors' element={
            <DoctorRoute>
              <DocDoctor />
            </DoctorRoute>

          } />

          {/* Receptionist Routes Start */}
          <Route path='/rep/department' element={
            <ReceptionistRoute>
              <RepDepartment />
            </ReceptionistRoute>

          } />
          <Route path='/rep/setting' element={
            <ReceptionistRoute>
              <RepSetting />
            </ReceptionistRoute>

          } />
          <Route path='/rep/setting/edit' element={
            <ReceptionistRoute>
              <RepEdit />
            </ReceptionistRoute>

          } />
          <Route path='/rep/receptionists' element={
            <ReceptionistRoute>
              <Receptionist />
            </ReceptionistRoute>

          } />








          <Route path='*' element={<Login />} />
          <Route path='/contact' element={<Contact />} />
          <Route path='/rigister' element={<Rigister />} />

          <Route path='/Booknow' element={<Bookappointment />} />



        </Routes>





      </BrowserRouter>
    </>
  )
}

export default App
