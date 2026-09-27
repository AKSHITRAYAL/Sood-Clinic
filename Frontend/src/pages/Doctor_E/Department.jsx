import React from 'react'
import { useState, useEffect } from "react";
import axios from 'axios'

import Navbar from './Components/Navbar'


const Department = () => {
    const [profile, setProfile] = useState('')
    const [data, setData] = useState([])
    const [name, setName] = useState('')
    const [description, setDescription] = useState('')


    const getdata = () => {
        axios.get('http://localhost:3001/getdep')
            .then((res) => {
                console.log(res)
                setData(res.data)
            })
            .catch((er) => { console.log(err) })
    }
    useEffect(() => {
        if (profile !== '') {
            window.scroll(0, 0)
            setTimeout(() => {
                setProfile('')
            }, 2000);
        }
        getdata()
    }, [profile])


    return (
        <div>
            <Navbar></Navbar>

            <div className='h-[1px] w-full bg-black dark:bg-white'>

            </div>
            <div className="container mx-auto w-full space-y-4  my-4 p-4 rounded-xl">
                <h1 className='text-3xl font-semibold'>Departments</h1>

                {
                    data.map((data) => (

                        <div className='border relative rounded-lg p-2 px-10  flex gap-4' >
 
                            <div className='flex flex-col  justify-center gap-4 '>
                                <div className="flex gap-1 flex-col -center">

                                    <h1 className='text-2xl '>{data.name}</h1>

                                </div>
                                <div className='text-sm dark:text-gray-400 '>
                                    {data.description}
                                </div>
                            </div>
                        </div>
                    ))}

            </div>
        </div>
    )
}

export default Department
