"use client";
import { useState } from "react";
import { useNavigate } from 'react-router-dom'

// import { signIn } from "next-auth/react";
// import { useRouter } from "next/navigation";
import React from "react";



import oeye from './ui/openeye.png'
import { Link } from "react-router-dom";


import ceye from './ui/closedeye.png'
import Navbar from "../components/Navbar";
import loading from './ui/loading.gif'
import axios from 'axios'
import Footer from "../components/Footer";



const page = () => {
    const [email, setEmail] = useState('')
    const [phonenumber, setPhonenumber] = useState('')
    const [gender, setGender] = useState('')
    const [name, setName] = useState('')
    const navi = useNavigate();
    const [password, setPassword] = useState()
    const [error, setError] = useState(null);
    // const navi = useNavigate()
    const [passwordeye, setPasswordeye] = useState(ceye)
    const [passwordtype, setPasswordtype] = useState("password"

    )
    const [loadings, setLoadings] = useState({ display: 'none' })



    const handeleye = () => {
        if (passwordeye == ceye) {
            setPasswordtype('text')
            setPasswordeye(oeye)
        } else {
            setPasswordtype('password')
            setPasswordeye(ceye)
        }

    }
    // const handelrelod = () => {
    //     window.location.reload(true)
    // }
    // const handellogin2 = async (e) =>{
    //     e.preventDefault();
    //     const res = axios.post('api/register',{email,password})
    //     if (res){
    //         console.log(res) 
    //     }
    // }
    const handellogin =  (e) =>{
        e.preventDefault();
        axios.post('http://localhost:3001/adminrigister' ,{name, email, password, phonenumber, gender })
        .then((res) => {console.log(res)})
        .catch((err) => {console.log(err)})
    }
    // const handellogin = async (e) => {
    //     setLoadings({ display: 'flex' })
    //     // e.preventDefault();

    //     // const result = await signIn("credentials", {
    //     //   redirect: false, 
    //     //   email,
    //     //   password,
    //     // });

    //     // if (result.error) {
    //     // setLoadings({display:'none'})

    //     //   setError('something went Wrong');  
    //     //   setTimeout(() => {
    //     //   setError('');  

    //     //   }, 3000);
    //     // } else {
    //     //     setLoadings({display:'none'})

    //     //   navi("/Panel");
    //     // }

    // }
    return (
        <>
            <Navbar />
            <div className='  bg-center w-full max-h-auto my-5 min-h-[calc(100vh-130px)]  flex flex-col justify-center  items-center'>



                <div className='w-full  mx-4  bg-gg h-auto  lg:w-1/3  lg:rounded-xl md:w-1/2 md:rounded-xl 2xl:w-1/3    p-1  '>



                    <div className='relative' >
                        <div style={loadings} className='absolute top-0 left-0 rounded-2xl  w-full h-full box-border p-4 flex items-center justify-center z-50 bg-[#0000004d]'>

                            <img
                                className=" object-cover    "
                                src={loading} // Path to your image
                                sizes={50}
                                alt="Description of image"
                            />
                        </div>
                        <form onSubmit={handellogin} className=' w-full gap-6 px-5 mt-2 py-6 flex flex-col'>
                            {error && <p style={{ color: 'red' }}>{error}</p>}

                            <label className=' text-center  font-medium text-2xl' >Login Admin!</label>


                            <div className='flex flex-col '>

                                <label htmlFor="Email" className='font-medium text-sm ' >Email Address</label>
                                <input type="email" required className='pt-2 focus:outline-none px-2 border-gray-700 bg-transparent border-x-0 border-t-0 border-b-2'
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                            <div className='flex flex-col '>

                                <label htmlFor="Enter Your FullName" className='font-medium text-sm ' >Enter Your Full Name</label>
                                <input type="text" required
                                    className='pt-2 focus:outline-none px-2 border-gray-700 bg-transparent border-x-0 border-t-0 border-b-2'
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>
                            <div className='flex flex-col '>

                                <label htmlFor="Email" className='font-medium text-sm ' >Enter Your Phonenumber</label>
                                <input type="number" required className='pt-2 focus:outline-none px-2 border-gray-700 bg-transparent border-x-0 border-t-0 border-b-2'
                                    onChange={(e) => setPhonenumber(e.target.value)}
                                />
                            </div>
                            <div className='flex flex-col '>

                                <label htmlFor="Email" className='font-medium text-sm mb-3' >Select Your Gender</label>
                                <div className="flex flex-wrap gap-3 items-center justify-center">
                                <input type="radio" name="gender" value={'Male'} required placeholder="" className='pt-2 focus:outline-none px-2 border-gray-700 bg-transparent border-x-0 border-t-0 border-b-2'
                                    onChange={(e) => setGender(e.target.value)}
                                />
                                <label htmlFor="Email" className='font-medium text-sm ' >Male</label>
                                <input type="radio" name="gender" value={'Female'} required className='pt-2 focus:outline-none px-2 border-gray-700 bg-transparent border-x-0 border-t-0 border-b-2'
                                    onChange={(e) => setGender(e.target.value)}
                                />
                                 <label htmlFor="Email" className='font-medium text-sm ' >Female</label>
                                <input type="radio" name="gender" value={'other'} required className='pt-2 focus:outline-none px-2 border-gray-700 bg-transparent border-x-0 border-t-0 border-b-2'
                                    onChange={(e) => setGender(e.target.value)}
                                />
                                 <label htmlFor="Email" className='font-medium text-sm ' >Other</label>
                                </div>

                            </div>

                            <div className='flex flex-col gap-1'>

                                <label className='font-medium text-sm ' htmlFor="Password">Password</label>
                                <div className='w-full relative'>
                                    <input required type={passwordtype} className=' pt-2 px-2 w-full border-gray-700  focus:outline-none bg-transparent border-b-2 border-x-0 border-t-0'
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                    <div className='p-[3px] bg-gg absolute rounded-t-md -top-1     right-0  '>

                                        <img
                                            className=" object-cover  "
                                            src={passwordeye} // Path to your image
                                            alt="Description of image"

                                            width={30}
                                            onClick={handeleye}
                                            height={30}
                                        // layout='responsive'
                                        />

                                    </div>
                                </div>
                            </div>
                            <input type="submit" value={'Login Now'} className='shadow-sm bg-bb hover:bg-[rgba(0,177,200,0.88)] active:bg-[rgba(0,177,200,0.94)] py-3 rounded-xl mt-3' />
                        </form>
                    </div>

                </div>
            </div>
            <Footer></Footer>
        </>

    )
}

export default page
