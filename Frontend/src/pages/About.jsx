import React from 'react';
import Navbar from '../components/Navbar';

const About = () => {
  return (
    <>
    <Navbar/>
    <div className="flex flex-col md:flex-row items-centerp-6">
      <div className="md:w-1/2 p-4">
        <img
          src="https://images.pexels.com/photos/9951393/pexels-photo-9951393.jpeg?auto=compress&cs=tinysrgb&w=600"
          alt="Healthcare professional with child"
          className="rounded-lg shadow-lg"
        />
      </div>
      <div className="md:w-1/2 p-4">
        <h1 className="text-3xl font-bold mb-4">Welcome to Sood Clinic</h1>
        <h2 className="text-xl font-semibold mb-2">About Dr. Brig. A. K. Sood VSM (Retd)</h2>
        <p className="mb-4">
          Dr. Brig. A. K. Sood VSM (Retd) is a gastroenterologist in Panchkula with over 38 years of clinical experience. He is the clinic owner at Sood Clinic and is registered with the Haryana Medical Council (Registration No. HR886).
        </p>
        <h2 className="text-xl font-semibold mb-2">Education &amp; care</h2>
        <p className="mb-4">
          His published qualifications include MBBS, MD, DNB and DM. Sood Clinic provides in-clinic and video consultations for gastroenterology care.
        </p>
        <h2 className="text-xl font-semibold mb-2">Clinic hours</h2>
        <p className="mb-4">Monday to Saturday: 8:00 AM–10:00 AM and 5:00 PM–6:30 PM.</p>
        <p className="text-sm text-slate-500">Please confirm availability before visiting, as consultation timings can change.</p>

      </div>
    </div>
    </>

  );
};

export default About;
