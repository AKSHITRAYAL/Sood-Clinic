import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { addDoc, collection, getDocs } from 'firebase/firestore';
import { firestore } from '../lib/firebase';

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
        getDocs(collection(firestore, 'branches'))
            .then((snapshot) => setBranchId(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).find((branch) => branch.active)?.id || ''))
            .catch(() => setProfile('Booking is temporarily unavailable. Please try again later.'));
    }, [])
    useEffect(() => {
        if (!branchId) return;
        getDocs(collection(firestore, 'departments'))
            .then((snapshot) => setData(snapshot.docs.map((doc) => ({ _id: doc.id, ...doc.data() })).filter((department) => department.branchId === branchId && department.active && department.publicBookingEnabled)))
            .catch(() => setProfile('Unable to load available departments.'));
    }, [branchId]);
    useEffect(() => {
        if (!branchId || !formData.department) { setFilteredDoctors([]); return; }
        getDocs(collection(firestore, 'doctors'))
            .then((snapshot) => {
              const doctors = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((doctor) => doctor.branchId === branchId && doctor.active && doctor.bookingEnabled && doctor.departmentIds?.includes(formData.department));
              setDocData(doctors); setFilteredDoctors(doctors);
            })
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
        const selectedMinutes = Number(formData.appointmentTime.split(':')[0]) * 60 + Number(formData.appointmentTime.split(':')[1]);
        const schedule = doctor?.schedule?.find((rule) => {
          const [startHour, startMinute] = rule.startTime.split(':').map(Number);
          const [endHour, endMinute] = rule.endTime.split(':').map(Number);
          return rule.weekday === appointmentDay && selectedMinutes >= startHour * 60 + startMinute && selectedMinutes < endHour * 60 + endMinute;
        });
        if (!schedule) { setProfile('This doctor is not available on the selected day.'); return; }
        const startsAt = new Date(`${formData.appointmentDate}T${formData.appointmentTime}:00`);
        const endsAt = new Date(startsAt.getTime() + schedule.slotMinutes * 60000);
        addDoc(collection(firestore, 'appointments'), {
          branchId,
          departmentId: formData.department,
          doctorId: formData.doctor,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          reason: '',
          status: 'scheduled',
          source: 'patient_portal',
          patient: { name: formData.name, phone: formData.phoneNumber, gender: formData.gender.toLowerCase(), consentToTreatment: true },
        })
        .then((appointment)=>{
            setProfile(`Appointment request received. Reference: SC-${appointment.id.slice(0, 8).toUpperCase()}`)
        })
        .catch(() => { setProfile('Unable to book the appointment. Please try again.') })
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
                    appointmentDate: '',
                    appointmentTime: ''
                })
            }, 2000);
        }
    }, [profile])
    return (

        <>
            <Navbar />
            <main className="booking-page">
              <section className="booking-page__intro">
                <p>SOOD CLINIC · PANCHKULA</p>
                <h1>Book your consultation</h1>
                <span>Choose a department and doctor, then select a convenient time for your visit.</span>
              </section>
            <div className="booking-card">
                <h2>Appointment details</h2>

                <form onSubmit={handleSubmit} className="booking-form">
                {profile && <p className="booking-message" role="status">{profile}</p>}

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
            </main>
            <Footer />
        </>

    );
};

export default Bookappointment;
