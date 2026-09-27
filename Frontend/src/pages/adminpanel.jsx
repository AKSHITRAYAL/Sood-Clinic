import React from 'react'
import { useState, useEffect } from 'react'
import axios from 'axios'

import Navbar from './Admin_E/Components/Navbar'
import { Link, NavLink } from 'react-router-dom'
const adminpanel = () => {
  const [profile, setProfile] = useState('')

  const [doctorCount, setDoctorCount] = useState(0);
  const [repCount, setRepCount] = useState(0);
  const [appointmentcount, setAppointmentcount] = useState(0)
  const [appointments, setAppointments] = useState([])
  const [status, setStatus] = useState('')



  useEffect(() => {
    const fetchDoctorCount = async () => {
      try {
        const res = await axios.get('http://localhost:3001/doctorscount'); // Adjust the URL if necessary

        setDoctorCount(res.data.count);
        console.log(res)
      } catch (error) {
        console.error('Error fetching doctor count:', error);
      }
    };
    const fetchrepCount = async () => {
      try {
        const res = await axios.get('http://localhost:3001/repcount'); // Adjust the URL if necessary

        setRepCount(res.data.count);
        console.log(res)
      } catch (error) {
        console.error('Error fetching doctor count:', error);
      }
    };
    const fetchapointCount = async () => {
      try {
        const res = await axios.get('http://localhost:3001/apointcount'); // Adjust the URL if necessary

        setAppointmentcount(res.data.length);
        setAppointments(res.data)
        console.log(res)
      } catch (error) {
        console.error('Error fetching doctor count:', error);
      }
    };
    fetchapointCount()
    fetchrepCount();
    fetchDoctorCount();
  }, [profile]);
  const handelupdate = (id) => {
    axios.post('http://localhost:3001/apointupdate', { id, status })
      .then((res) => {
        console.log(res)
        if (res.data.status === 'success') {
          setProfile('Appointment Updated Successfully!')
        } else {
          setProfile('Appointment not found')
        }


      })
      .catch((err) => { console.log(err) })


  }
  useEffect(() => {

    if (profile !== '') {
      setTimeout(() => {
        setProfile('')
      }, 4000);
    }

  }, [profile])
  const handeldelete = (id) => {
    axios.post('http://localhost:3001/appointdel', { id })
      .then((res) => {
        console.log(res)
        if (res.data.status === 'success') {
          setProfile('Appointment Deleted Successfully!')
        } else {
          setProfile('Message not found')
        }


      })
      .catch((err) => { console.log(err) })
  }

  return (
    <div>
      <Navbar></Navbar>
      <div className='container mx-auto gap-2 grid lg:grid-cols-4 md:grid-cols-3 grid-cols-1 w-full   text-white     py-4  px-2 '>
        <div className='bg-[#c65857] lg:w-full md:w-full lg:col-span-2 md:col-span-2 w-full   relative rounded-2xl flex h-[250px]'>
          <img className='lg:w-[250px] rounded-l-2xl  md:w-[250px]  absolute w-full h-[250px] bottom-0 lg:relative md:relative object-cover' src="https://img.freepik.com/free-photo/portrait-3d-male-doctor_23-2151107407.jpg?t=st=1731094682~exp=1731098282~hmac=4d7a74c66313d9b5c7de8674a3e01f6eabc84df817ba7d13b01fbaf0a56d9afd&w=740" alt="" />
          <div className='flex justify-center bg-[#00000063] lg:bg-transparent md:bg-transparent z-10 p-2 items-center flex-col '>
            <h1 className='text-3xl self-start font-semibold'>Hi, Admin</h1>
          </div>
        </div>
        <div className=' rounded-2xl  p-4 py-16 h-full content-center  bg-bb'>
          <h1 className='text-xl font-semibold'>Total Appointments</h1>
          <p className='text-lg font-semibold'>{appointmentcount}</p>
        </div>
        <div className=' dark:border-none border-2 border-gg rounded-2xl p-4 py-16 h-full  content-center text-gg bg-slate-300'>
          <h1 className='text-2xl font-semibold'>Ristered Doctors</h1>
          <p className='text-2xl font-semibold'>{doctorCount}</p>

        </div>
        <div className=' dark:border-none border-2 border-bb rounded-2xl bg-slate-300 p-4 py-16 h-full  content-center text-bb '>
          <h1 className='text-xl font-semibold'>Ristered Receptionist</h1>
          <p className='text-2xl font-semibold'>{repCount}</p>

        </div>

      </div>
      <div className="container px-6 py-8 mx-auto border rounded-xl my-4">
        <h1 className='text-2xl'>Appointments</h1>
        <label htmlFor="" className="text-xl text-red-600">{profile}</label>
        <div className="overflow-x-auto lg:overflow-visible">
          <table className="w-full border-separate border-spacing-4 text-left">
            <thead className="hidden md:table-header-group">
              <tr>
                <th>Patient</th>
                <th>Date</th>
                <th>Time</th>
                <th>Doctor</th>
                <th>Department</th>
                <th>Current Status</th>
                <th>Select Status</th>
                <th>Update Status</th>
                <th>Delete</th>
              </tr>
            </thead>
            <tbody>
              {appointments
                .map((data) => {
                  const formattedDate = new Date(data.appointmentDate).toLocaleDateString('en-CA');
                  return (
                    <tr
                      key={data._id}
                      className="border p-2 md:table-row block md:border-none"
                    >
                      <td className="block md:table-cell py-2 md:py-0">
                        <span className="md:hidden font-semibold">Patient:</span> {data.name} {data.fatherName}
                      </td>
                      <td className="block md:table-cell py-2 md:py-0">
                        <span className="md:hidden font-semibold">Date:</span> {formattedDate}
                      </td>
                      <td className="block md:table-cell py-2 md:py-0">
                        <span className="md:hidden font-semibold">Time:</span> {data.appointmentTime}
                      </td>
                      <td className="block md:table-cell py-2 md:py-0">
                        <span className="md:hidden font-semibold">Doctor:</span> {data.doctor}
                      </td>
                      <td className="block md:table-cell py-2 md:py-0">
                        <span className="md:hidden font-semibold">Department:</span> {data.department}
                      </td>
                      <td className="block md:table-cell py-2 md:py-0">
                        <span className="md:hidden font-semibold">Current Status:</span> {data.status}
                      </td>
                      <td className="block md:table-cell py-2 md:py-0">
                        <span className="md:hidden font-semibold">Select Status:</span>
                        <select onChange={(e) => setStatus(e.target.value)} className="px-2 py-2 w-full md:w-auto">
                          <option value="">Select Status</option>
                          <option value="Pending">Pending</option>
                          <option value="Accepted">Accepted</option>
                          <option value="Done">Done</option>
                          <option value="Cancel">Cancel</option>
                        </select>
                      </td>
                      <td className="block md:table-cell py-2 md:py-0">
                        <span className="md:hidden font-semibold">Update Status:</span>
                        <button onClick={() => handelupdate(data._id)} className="bg-gg hover:opacity-90 px-2 py-2 w-full md:w-auto">Update</button>
                      </td>
                      <td className="block md:table-cell py-2 md:py-0">
                        <span className="md:hidden font-semibold">Delete:</span>
                        <button onClick={() => handeldelete(data._id)}>
                          <img className="w-9 h-9 mx-auto md:mx-0" src="https://img.icons8.com/external-flatart-icons-lineal-color-flatarticons/64/external-dustbin-smart-home-flatart-icons-lineal-color-flatarticons.png" alt="delete" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>



      </div>

    </div>
  )
}

export default adminpanel
