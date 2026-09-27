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
    const handeldelete = (id) => {
        axios.post('http://localhost:3001/depdel', { id })
            .then((res) => {
                console.log(res)
                if (res.data.status === 'success') {
                    setProfile('Department Deleted Successfully!')
                } else {
                    setProfile('Department not found')
                }


            })
            .catch((err) => { console.log(err) })
    }
    const handelsubmit = (e) => {
        e.preventDefault()
        axios.post('http://localhost:3001/adddep', { name, description })
            .then((res) => {
                console.log(res)
                if (res.data.status === 'success') {
                    setProfile('Department Added Successfully!')
                } else {
                    setProfile('Server Error')
                }

            })
            .catch((err) => { console.log(err) })

    }

    return (
        <div>
            <Navbar></Navbar>
            <div className='container  w-full p-8  my-2 mx-auto'>
                <h1 className='text-xl font-semibold mb-3'>Add Department</h1>
                <label htmlFor="" className="text-xl text-red-600">{profile}</label>
                

                <form onSubmit={handelsubmit} className=' flex flex-wrap items-center gap-3'>
                    <label className="text-lg font-semibold dark:text-gray-400" htmlFor="">Name:</label>
                    <input required onChange={(e) => setName(e.target.value)} type="text" className="p-3 flex-grow border dark:border-none rounded-lg appearance-none" />

                    <label className="text-lg font-semibold dark:text-gray-400" htmlFor="">Discription</label>
                    <input required onChange={(e) => setDescription(e.target.value)} type="text" className="p-3 flex-grow border dark:border-none rounded-lg appearance-none" />
                    <input type="submit" className="p-3 px-6 hover:opacity-80 text-white bg-gg rounded-3xl" value="Add" />




                </form>
            </div>
            <div className='h-[1px] w-full bg-black dark:bg-white'>

            </div>
            <div className="container mx-auto w-full space-y-4  my-4 p-4 rounded-xl">
                <h1 className='text-3xl font-semibold'>Departments</h1>

                {
                    data.map((data) => (

                        <div className='border relative rounded-lg p-2 px-10  flex gap-4' >
                            <button onClick={() => handeldelete(data._id)} className='w-[36px] h-[36px] absolute top-1/2 translate-y-[-50%] right-4'>

                                <img className='w-[36px] h-[36px] absolute top-1/2 translate-y-[-50%] right-4' src="https://img.icons8.com/external-flatart-icons-lineal-color-flatarticons/64/external-dustbin-smart-home-flatart-icons-lineal-color-flatarticons.png" alt="" />
                            </button>
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
