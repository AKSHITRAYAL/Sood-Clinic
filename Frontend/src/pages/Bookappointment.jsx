import React, { useState, useEffect } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { addDoc, collection } from 'firebase/firestore';
import { firestore } from '../lib/firebase';

const SOOD_CLINIC_BRANCH_ID = 'sood-clinic';
const GASTROENTEROLOGY_ID = 'gastroenterology';
const AK_SOOD_ID = 'brig-ak-sood';
const AK_SOOD_SCHEDULE = [1, 2, 3, 4, 5, 6].flatMap((weekday) => [
  { weekday, startTime: '08:00', endTime: '10:00', slotMinutes: 20 },
  { weekday, startTime: '17:00', endTime: '18:30', slotMinutes: 20 },
]);

const Bookappointment = () => {
    const [profile, setProfile] = useState('')


    const [formData, setFormData] = useState({
        name: '',
        fatherName: '',
        phoneNumber: '',
        maritalStatus: '',
        gender: '',
        bloodGroup: '',
        age: '',
        appointmentDate: '',
        appointmentTime: '',
    });
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((current) => ({ ...current, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const appointmentDay = new Date(`${formData.appointmentDate}T00:00:00`).getDay();
        const selectedMinutes = Number(formData.appointmentTime.split(':')[0]) * 60 + Number(formData.appointmentTime.split(':')[1]);
        const schedule = AK_SOOD_SCHEDULE.find((rule) => {
          const [startHour, startMinute] = rule.startTime.split(':').map(Number);
          const [endHour, endMinute] = rule.endTime.split(':').map(Number);
          return rule.weekday === appointmentDay && selectedMinutes >= startHour * 60 + startMinute && selectedMinutes < endHour * 60 + endMinute;
        });
        if (!schedule) { setProfile('This doctor is not available on the selected day.'); return; }
        const startsAt = new Date(`${formData.appointmentDate}T${formData.appointmentTime}:00`);
        const endsAt = new Date(startsAt.getTime() + schedule.slotMinutes * 60000);
        addDoc(collection(firestore, 'appointments'), {
          branchId: SOOD_CLINIC_BRANCH_ID,
          departmentId: GASTROENTEROLOGY_ID,
          doctorId: AK_SOOD_ID,
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
                <p className="mb-6 rounded-lg bg-sky-50 px-4 py-3 text-sm font-semibold text-[#1b5c9d]">Consultation with Dr. Brig. A. K. Sood VSM (Retd) · Gastroenterology</p>

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
