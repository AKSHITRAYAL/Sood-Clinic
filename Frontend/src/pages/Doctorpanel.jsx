import React from 'react'
import { useState, useEffect } from 'react'
import axios from 'axios'

import Navbar from './Doctor_E/Components/Navbar'

const Doctorpanel = () => {
  const id = localStorage.getItem('docid')
  const [profile, setProfile] = useState('')
  const [appointments, setAppointments] = useState([])
  const [name, setName] = useState('')
  const [status, setStatus] = useState('')

  // const [status ,setStatus] = useState('')

  const fetchapointCount = async () => {
    try {
      const res = await axios.get('http://localhost:3001/apointcount'); // Adjust the URL if necessary

      setAppointments(res.data)

    } catch (error) {
      console.error('Error fetching doctor count:', error);
    }
  }

  useEffect(() => {
    getdata(id)
    fetchapointCount()

    if (profile !== '') {
      window.scroll(0, 0)
      setTimeout(() => {
        setProfile('')
      }, 4000);
    }

  }, [profile])
  const getdata = (id) => {
    axios.post('http://localhost:3001/doctordata', { id })
      .then((res) => {
        console.log(res)
        setName(res.data.name)

      })
      .catch((err) => { console.log(err) })
  }




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
  return (
    <div>
      <Navbar></Navbar>
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
        .filter((data) => data.doctor === name)
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

export default Doctorpanel
