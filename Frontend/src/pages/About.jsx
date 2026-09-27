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
        <h2 className="text-xl font-semibold mb-2">Our Mission</h2>
        <p className="mb-4">
          Our mission is to provide thoughtful, dependable healthcare in an environment where every patient feels heard, respected, and supported.
        </p>
        <h2 className="text-xl font-semibold mb-2">Our Vision</h2>
        <p className="mb-4">
          We aim to be a trusted local clinic, using clear communication and well-organized care to make every visit simpler for patients and families.
        </p>

      </div>
    </div>
    </>

  );
};

export default About;
