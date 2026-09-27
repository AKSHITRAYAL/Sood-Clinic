import React from 'react'
import { useState, useEffect } from "react";
import axios from 'axios'
import Navbar from './Components/Navbar'
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { specializationOptions } from '../../constants/specializations';

const Apointment = () => {
    const [profile, setProfile] = useState('')
    
    const [formData, setFormData] = useState({
        name: '',
        fatherName: '',
        phoneNumber: '',
        maritalStatus: '',
        gender: '',
        bloodGroup: '',
        age: '',
        department: '',
        doctor: '',
        appointmentDate: null,
        appointmentTime: ''
      });
      const [filteredDoctors, setFilteredDoctors] = useState([]);

      const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((current) => ({ ...current, [name]: value, ...(name === 'department' ? { doctor: '' } : {}) }));
      };
    
      const handleDateChange = (date) => {
        setFormData({ ...formData, appointmentDate: date });
      };
    
      const handleSubmit = (e) => {
        e.preventDefault();
        const data = new FormData();
        for (let key in formData) {
          data.append(key, formData[key]);
        }
        console.log(formData)
        axios.post('http://localhost:3001/appointment',{formData})
        .then((res)=>{
            console.log(res)
            if (res.data.status === 'success') {
                setProfile('Appointment Booked Successfully!')
            } else {
                setProfile('Server Error')
            }

        })
        .catch((err) => { console.log(err) })
        
 }    

    const times = [
        "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
        "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM",
        "6:00 PM", "7:00 PM", "8:00 PM"
    ];


    const [data, setData] = useState([])
    const [docdata, setDocData] = useState([])
    const departments = specializationOptions(data)

    const getdata = () => {
        axios.get('http://localhost:3001/getdep')
            .then((res) => {
                console.log(res)
                setData(res.data)
            })
            .catch((err) => { console.log(err) })
    }
    const getdocdata = () => {
        axios.get('http://localhost:3001/getdoctor')
            .then((res) => {
                console.log(res)
                setDocData(res.data)
            })
            .catch((er) => { console.log(err) })
    }
    useEffect(() => {
        getdata()
        getdocdata()

    }, [])
    useEffect(() => {
        if (profile !== '') {
            window.scroll(0, 0)
            setTimeout(() => {
                setProfile('')
                setFormData({
                    name: '',
                    fatherName: '',
                    phoneNumber: '',
                    maritalStatus: '',
                    gender: '',
                    bloodGroup: '',
                    age: '',
                    department: '',
                    doctor: '',
                    appointmentDate: null,
                    appointmentTime: ''
                })
            }, 2000);
        }
    }, [profile])
    useEffect(() => {
        setFilteredDoctors(formData.department ? docdata.filter((doctor) => doctor.spcialization === formData.department) : []);
      }, [formData.department, docdata]);

    return (
        <div>
            <Navbar></Navbar>
            <div className="container mx-auto my-4 p-8 rounded-lg  shadow-md">
                <form onSubmit={handleSubmit} className="flex flex-col w-full gap-4">
                    <label htmlFor="" className="text-xl text-red-600">{profile}</label>

                    <label className="text-lg font-semibold dark:text-gray-400">Name:</label>
                    <input type="text" name="name" value={formData.name} onChange={handleChange} className="p-3 border dark:border-none rounded-lg" required />

                    <label className="text-lg font-semibold dark:text-gray-400">Father Name:</label>
                    <input type="text" name="fatherName" value={formData.fatherName} onChange={handleChange} className="p-3 border dark:border-none rounded-lg" required />

                    <label className="text-lg font-semibold dark:text-gray-400">Phone Number:</label>
                    <input type="tel" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} className="p-3 border dark:border-none rounded-lg" required />

                    <label className="text-lg font-semibold dark:text-gray-400">Marital Status:</label>
                    <select name="maritalStatus" value={formData.maritalStatus} onChange={handleChange} className="p-3 border dark:border-none rounded-lg" required>
                        <option value="">Select Status</option>
                        <option value="Single">Single</option>
                        <option value="Married">Married</option>
                        <option value="Divorced">Divorced</option>
                        <option value="Widowed">Widowed</option>
                    </select>

                    <label className="text-lg font-semibold dark:text-gray-400">Gender:</label>
                    <div className="flex gap-3">
                        <input type="radio" name="gender" value="Male" onChange={handleChange} required /> Male
                        <input type="radio" name="gender" value="Female" onChange={handleChange} required /> Female
                        <input type="radio" name="gender" value="Other" onChange={handleChange} required /> Other
                    </div>

                    <label className="text-lg font-semibold dark:text-gray-400">Blood Group:</label>
                    <select name="bloodGroup" value={formData.bloodGroup} onChange={handleChange} className="p-3 border dark:border-none rounded-lg" required>
                        <option value="">Select Blood Group</option>
                        <option value="A+">A+</option>
                        <option value="A-">A-</option>
                        <option value="B+">B+</option>
                        <option value="B-">B-</option>
                        <option value="AB+">AB+</option>
                        <option value="AB-">AB-</option>
                        <option value="O+">O+</option>
                        <option value="O-">O-</option>
                    </select>

                    <label className="text-lg font-semibold dark:text-gray-400">Age:</label>
                    <input type="number" name="age" value={formData.age} onChange={handleChange} className="p-3 border dark:border-none rounded-lg" required />

                    <label className="text-lg font-semibold dark:text-gray-400">Department:</label>
                    <select name="department" value={formData.department} onChange={handleChange} className="p-3 border dark:border-none rounded-lg" required>
                        <option value="">Select Department</option>
                        {departments.map((department) => <option key={department} value={department}>{department}</option>)}
                    </select>

                    <label className="text-lg font-semibold dark:text-gray-400">Doctors:</label>
                    <select name="doctor" value={formData.doctor} onChange={handleChange} className="p-3 border dark:border-none rounded-lg" required>
                        
                        {!formData.department?<option value="">Choose Department First</option>:<option value="">Select Doctor</option>}
                        {formData.department && !filteredDoctors.length && <option value="" disabled>No doctors currently available</option>}
                        {filteredDoctors.map((doctor) => (
                            <option key={doctor.name} value={doctor.name}>{doctor.name}</option>
                        ))}
                    </select>

                    <label className="text-lg font-semibold dark:text-gray-400">Appointment Date:</label>
                    <div className='flex justify-center'>

                    <DatePicker selected={formData.appointmentDate} onChange={handleDateChange} className="p-3 border dark:border-none rounded-lg " dateFormat="yyyy-MM-dd" minDate={new Date()} placeholderText="Select a date" required />
                    </div>

                    <label className="text-lg font-semibold dark:text-gray-400">Appointment Time:</label>
                    <select name="appointmentTime" value={formData.appointmentTime} onChange={handleChange} className="p-3 border dark:border-none rounded-lg" required>
                        <option value="">Select Time</option>
                        {times.map((time) => (
                            <option key={time} value={time}>{time}</option>
                        ))}
                    </select>

                    <button type="submit" className="p-3 px-6 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Book Appointment</button>
                </form>
            </div>

        </div>
    )
}

export default Apointment
