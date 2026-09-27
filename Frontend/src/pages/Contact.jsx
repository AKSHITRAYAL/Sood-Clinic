import React from 'react'
import { ContactForm, ContactCards } from '../components/rev'
import Navbar from '../components/Navbar'
import { useState,useEffect } from 'react'
import axios from 'axios'


const Contact = () => {
  const doctorImageURL = "https://images.pexels.com/photos/5215024/pexels-photo-5215024.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1";
  const [name, setName] = useState('')
  const [profile, setProfile] = useState('')

  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [title, setTitle] = useState('')


  const handelsubmit = (e) =>{
    e.preventDefault();
    
    axios.post('http://localhost:3001/message', { name,email,message,title })
    .then((res)=>{console.log(res)
      setProfile('Message Sended Successfully!')
      setTimeout(() => {
        setProfile('')
      }, 3000);

    })
    .catch((err)=>{console.log(err)})
  }
  return (

    <div>
      <Navbar />

      <ContactCards />
      <div className="flex flex-col md:flex-row md:gap-2 h-auto lg:flex-row items-center p-6  ">
        {/* Left Side: Doctor Image */}
        <div className="w-full h-[90vh] lg:w-1/2 mb-6 lg:mb-0 ">
          <img
            src={doctorImageURL}
            alt="Doctor"
            className="w-full rounded-lg shadow-md object-cover h-full"
          />
        </div>

        {/* Right Side: Contact Form */}

        <div className="w-full h-full lg:w-1/2 lg:pl-8">

          <h4 className="text-green-500 font-semibold">CONTACT US</h4>
          <h1 className=" text-3xl lg:text-4xl font-bold mt-2 mb-6">
            Send a Message <br /> & apply for treatments
          </h1>

          <form onSubmit={handelsubmit} className="space-y-4">
            <label htmlFor="" className="text-xl text-red-600">{profile}</label>
            <div className="flex flex-col lg:flex-row gap-4">
              <input
                type="text"
                placeholder="Your Name *"
                onChange={(e)=>setName(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md text-lg"
              />
              <input
                type="email"
                placeholder="Your Email *"
                onChange={(e)=>setEmail(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md text-lg"
              />
            </div>

            <div className="flex flex-col lg:flex-row gap-4">

              <input
                type="text"
                placeholder="Subject *"
                onChange={(e)=>setTitle(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-md text-lg"
              />
            </div>

            <textarea
            required
            onChange={(e)=>setMessage(e.target.value)}
              placeholder="Message"
              className="w-full p-3 border border-gray-300 rounded-md text-lg h-32"
            />

            <button
              type="submit"
              className="w-full lg:w-auto bg-green-500 text-white font-semibold py-3 px-6 rounded-md flex items-center justify-center space-x-2 hover:bg-green-600"
            >
              <span>SUBMIT NOW</span>
              <span className="transform ">✈️</span>
            </button>
          </form>
        </div>
      </div>
      <div className="overflow-hidden max-w-full w-full h-[500px]">
        <div id="google-maps-canvas" className="h-full w-full max-w-full">
          <iframe
            title="Google Maps"
            className="h-full w-full border-0"
            src="https://www.google.com/maps/embed/v1/place?q=Statue+Of+Liberty&key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8"
            allowFullScreen
          ></iframe>
        </div>
      </div>
    </div>
  )
}

export default Contact
