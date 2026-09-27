"use client";
import { useState, useEffect } from "react";
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
    const navi = useNavigate();
    const [password, setPassword] = useState()
    const [error, setError] = useState({ display: 'none' });
    // const navi = useNavigate()
    const [passwordeye, setPasswordeye] = useState(ceye)
    const [passwordtype, setPasswordtype] = useState("password")
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
    useEffect(() => {
        if (error.display === 'block') {
            setTimeout(() => {
                setError({ display: 'none' })
            }, 3000);
        }
    }, [error])

    const handellogin = (e) => {
        e.preventDefault();
        setLoadings({ display: 'flex' })


        axios.post('http://localhost:3001/adminlogin', { email, password })
            .then((res) => {
                const data = res.data
                console.log(res)
                if (data.status == 'invalid') {
                    console.log('nomatch')
                    setLoadings({ display: 'none' })

                    setError({ display: 'block' })
                    setTimeout(() => {
                        setError({ display: 'none' })

                    }, 3000);
                }
                else if (data.status == 'nopass') {
                    setError({ display: 'block' })
                    setLoadings({ display: 'none' })

                    setTimeout(() => {
                        setError({ display: 'none' })

                    }, 3000);

                }



                else if (data.type === 'admin') {


                    const token = localStorage.getItem('admintoken')
                    if (token) {
                        localStorage.removeItem('admintoken')

                        localStorage.setItem('admintoken', data.token)
                        localStorage.setItem('adminid', data.adminid)

                        navi('/')
                        setLoadings({ display: 'none' })
                    } else {


                        localStorage.setItem('admintoken', data.token)
                        localStorage.setItem('adminid', data.adminid)

                        navi('/')
                        setLoadings({ display: 'none' })
                    }


                }
                else if (data.type === "doctor") {

                    const token = localStorage.getItem('doctoken')
                    if (token) {
                        localStorage.removeItem('doctoken')

                        localStorage.setItem('doctoken', data.token)
                        localStorage.setItem('docid', data.docid)

                        navi('/')
                        setLoadings({ display: 'none' })
                    } else {


                        localStorage.setItem('doctoken', data.token)
                        localStorage.setItem('docid', data.docid)
                        navi('/')
                        setLoadings({ display: 'none' })
                    }

                }
                else if (data.type === "receptionist"){
                    const token = localStorage.getItem('reptoken')
                    if (token) {
                        localStorage.removeItem('reptoken')

                        localStorage.setItem('reptoken', data.token)
                        localStorage.setItem('repid', data.repid)

                        navi('/')
                        setLoadings({ display: 'none' })
                    } else {


                        localStorage.setItem('reptoken', data.token)
                        localStorage.setItem('repid', data.repid)

                        navi('/')
                        setLoadings({ display: 'none' })
                    }

                
                }





            })
            .catch((err) => { console.log(err) })

    }
    return (
        <>
            <Navbar />
            <div className='  bg-center w-full h-[calc(100vh-130px)]  flex flex-col justify-center  items-center'>



                <div className='w-full  mx-4  bg-gg h-auto  lg:w-1/3  lg:rounded-xl md:w-1/2 md:rounded-xl 2xl:w-1/3    p-1  '>



                    <div className='relative' >
                        <div style={loadings} className='absolute top-0 left-0 rounded-2xl  w-full h-full box-border p-4 flex items-center justify-center z-50 bg-[#0000004d]'>

                            <img
                                className=" object-cover    "
                                src={loading}
                                sizes={50}
                                alt="Description of image"
                            />
                        </div>
                        <form onSubmit={handellogin} className=' w-full gap-6 px-5 mt-2 py-6 flex flex-col'>

                            <label className=' text-center  font-medium text-2xl' >Login Admin!</label>

                            <label style={error} className="text-lg text-red-700 hidden" htmlFor="">Invalid Email and Password</label>

                            <div className='flex flex-col '>

                                <label htmlFor="Email" className='font-medium text-sm ' >Email Address</label>
                                <input type="email" required className='pt-2 focus:outline-none px-2 border-gray-700 bg-transparent border-x-0 border-t-0 border-b-2'
                                    onChange={(e) => setEmail(e.target.value)}
                                />
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
                                            src={passwordeye}
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
