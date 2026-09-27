import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:3001';

const Bookappointment = () => {
    const [filteredDoctors, setFilteredDoctors] = useState([]);
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
        appointmentDate: '',
        appointmentTime: '',
    });
    const [data, setData] = useState([])
    const [docdata, setDocData] = useState([])
    const [branchId, setBranchId] = useState('')

    useEffect(() => {
        axios.get(`${API_BASE_URL}/api/v1/public/booking/branches`)
            .then((res) => setBranchId(res.data.data[0]?._id || ''))
            .catch(() => setProfile('Booking is temporarily unavailable. Please try again later.'));
    }, [])
    useEffect(() => {
        if (!branchId) return;
        axios.get(`${API_BASE_URL}/api/v1/public/booking/branches/${branchId}/departments`)
            .then((res) => setData(res.data.data))
            .catch(() => setProfile('Unable to load available departments.'));
    }, [branchId]);
    useEffect(() => {
        if (!branchId || !formData.department) { setFilteredDoctors([]); return; }
        axios.get(`${API_BASE_URL}/api/v1/public/booking/branches/${branchId}/departments/${formData.department}/doctors`)
            .then((res) => { setDocData(res.data.data); setFilteredDoctors(res.data.data); })
            .catch(() => { setDocData([]); setFilteredDoctors([]); setProfile('Unable to load doctors for this department.'); });
    }, [branchId, formData.department]);
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((current) => ({ ...current, [name]: value, ...(name === 'department' ? { doctor: '' } : {}) }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const doctor = docdata.find((item) => item.id === formData.doctor);
        const appointmentDay = new Date(`${formData.appointmentDate}T00:00:00`).getDay();
        const schedule = doctor?.schedule?.find((rule) => rule.weekday === appointmentDay);
        if (!schedule) { setProfile('This doctor is not available on the selected day.'); return; }
        const startsAt = new Date(`${formData.appointmentDate}T${formData.appointmentTime}:00`);
        const endsAt = new Date(startsAt.getTime() + schedule.slotMinutes * 60000);
        axios.post(`${API_BASE_URL}/api/v1/public/booking/appointments`, {
          branchId,
          departmentId: formData.department,
          doctorId: formData.doctor,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          reason: formData.reason,
          patient: { name: formData.name, phone: formData.phoneNumber, gender: formData.gender.toLowerCase(), consentToTreatment: true }
        })
        .then((res)=>{
            setProfile(`Appointment booked successfully. Reference: ${res.data.data.reference}`)
        })
        .catch((err) => { setProfile(err.response?.data?.error?.message || 'Unable to book the appointment.') })
    };
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
    return (

        <>
            <Navbar />
            <div className="max-w-lg mx-auto p-6  shadow-lg rounded-lg">
                <h2 className="text-2xl font-bold text-center mb-4">Book an Appointment</h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                <label htmlFor="" className="text-xl text-red-600">{profile}</label>

                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium">Full Name</label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            required
                            className="w-full border dark:border-none px-4 py-2 rounded"
                            placeholder="Enter full name"
                        />
                    </div>

                    {/* Father's Name */}
                    <div>
                        <label className="block text-sm font-medium">Father's Name</label>
                        <input
                            type="text"
                            name="fatherName"
                            value={formData.fatherName}
                            onChange={handleChange}
                            required
                            className="w-full border dark:border-none px-4 py-2 rounded"
                            placeholder="Enter father's name"
                        />
                    </div>

                    {/* Phone Number */}
                    <div>
                        <label className="block text-sm font-medium">Phone Number</label>
                        <input
                            type="tel"
                            name="phoneNumber"
                            value={formData.phoneNumber}
                            onChange={handleChange}
                            required
                            className="w-full border dark:border-none px-4 py-2 rounded"
                            placeholder="Enter phone number"
                        />
                    </div>

                    {/* Marital Status */}
                    <div>
                        <label className="block text-sm font-medium">Marital Status</label>
                        <select
                            name="maritalStatus"
                            value={formData.maritalStatus}
                            onChange={handleChange}
                            required
                            className="w-full border dark:border-none px-4 py-2 rounded"
                        >
                            <option value="">Select status</option>
                            <option value="Single">Single</option>
                            <option value="Married">Married</option>
                            <option value="Divorced">Divorced</option>
                        </select>
                    </div>

                    {/* Gender */}
                    <div>
                        <label className="block text-sm font-medium">Gender</label>
                        <select
                            name="gender"
                            value={formData.gender}
                            onChange={handleChange}
                            required
                            className="w-full border dark:border-none px-4 py-2 rounded"
                        >
                            <option value="">Select gender</option>
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                            <option value="Other">Other</option>
                        </select>
                    </div>

                    {/* Blood Group */}
                    <div>
                        <label className="block text-sm font-medium">Blood Group</label>
                        <select
                            name="bloodGroup"
                            value={formData.bloodGroup}
                            onChange={handleChange}
                            required
                            className="w-full border dark:border-none px-4 py-2 rounded"
                        >
                            <option value="">Select blood group</option>
                            <option value="A+">A+</option>
                            <option value="A-">A-</option>
                            <option value="B+">B+</option>
                            <option value="B-">B-</option>
                            <option value="AB+">AB+</option>
                            <option value="AB-">AB-</option>
                            <option value="O+">O+</option>
                            <option value="O-">O-</option>
                        </select>
                    </div>

                    {/* Age */}
                    <div>
                        <label className="block text-sm font-medium">Age</label>
                        <input
                            type="number"
                            name="age"
                            value={formData.age}
                            onChange={handleChange}
                            required
                            className="w-full border dark:border-none px-4 py-2 rounded"
                            placeholder="Enter age"
                        />
                    </div>

                    {/* Department */}
                    <div>
                        <label className="block text-sm font-medium">Department</label>
                        <select name="department" value={formData.department} onChange={handleChange} className="p-3 border dark:border-none w-full dark:border dark:border-none-none rounded-lg" required>
                            <option value="">Select Department</option>
                            {!data.length && <option value="" disabled>No departments currently available</option>}
                            {data.map((department) => <option key={department._id} value={department._id}>{department.name}</option>)}
                        </select>
                    </div>

                    {/* Doctor */}
                    <div>
                        <label className="block text-sm font-medium">Doctor</label>
                        <select name="doctor" value={formData.doctor} onChange={handleChange} className="p-3 w-full border dark:border-none dark:border dark:border-none-none rounded-lg" required>

                            {!formData.department ? <option value="">Choose Department First</option> : <option value="">Select Doctor</option>}
                            {formData.department && !filteredDoctors.length && <option value="" disabled>No doctors currently available</option>}
                            {filteredDoctors.map((doctor) => (
                                <option key={doctor.id} value={doctor.id}>{doctor.name}{doctor.qualification ? ` — ${doctor.qualification}` : ''}</option>
                            ))}
                        </select>
                    </div>

                    {/* Appointment Date */}
                    <div>
                        <label className="block text-sm font-medium">Appointment Date</label>
                        <input
                            type="date"
                            name="appointmentDate"
                            value={formData.appointmentDate}
                            onChange={handleChange}
                            required
                            min={new Date().toISOString().slice(0, 10)}
                            className="w-full border dark:border-none px-4 py-2 rounded"
                        />
                    </div>

                    <label className="flex gap-2 items-start text-sm"><input type="checkbox" required className="mt-1" /> <span>I consent to the clinic recording my details to arrange and provide this appointment.</span></label>

                    {/* Appointment Time */}
                    <div>
                        <label className="block text-sm font-medium">Appointment Time</label>
                        <input
                            type="time"
                            name="appointmentTime"
                            value={formData.appointmentTime}
                            onChange={handleChange}
                            required
                            className="w-full border dark:border-none px-4 py-2 rounded"
                        />
                    </div>

                    {/* Submit Button */}
                    <div className="text-center">
                        <button
                            type="submit"
                            className="bg-blue-500 w-full text-white px-6 py-2 rounded hover:bg-blue-600"
                        >
                            Book Appointment
                        </button>
                    </div>
                </form>
            </div>
        </>

    );
};

export default Bookappointment;
