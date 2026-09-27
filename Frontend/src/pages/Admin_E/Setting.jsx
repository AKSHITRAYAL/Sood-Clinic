import React from 'react'
import Navbar from './Components/Navbar'
import { useEffect, useState } from 'react'
import axios from 'axios'
// import { Navigate } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
const Setting = () => {
  const navi = useNavigate()
  const id = localStorage.getItem('adminid')
  const [data, setData] = useState({})


  // Handle file selection


  const getdata = (id) => {
    axios.post('http://localhost:3001/admindata', { id })
      .then((res) => {
        console.log(res)
        setData(res.data)
      })
      .catch((err) => { console.log(err) })
  }
  useEffect(() => {
    if (id) {

      getdata(id)
    }


  }, [])


  return (
    <div>
      <Navbar></Navbar>
      <div className='container mx-auto py-6 space-y-5 px-2'>
        <h1 className='font-semibold text-lg '> My Profile</h1>
        <div className='p-8 border rounded-xl'>
          <div className='flex items-center flex-wrap md:justify-between justify-center  lg:justify-between  gap-2 md:px-5 px-0 lg:px-5'>
            <div className='flex flex-wrap gap-4 items-center md:justify-between justify-center  lg:justify-between md:px-5 px-0 lg:px-5'>

              <img className='rounded-full object-cover w-[150px] h-[150px]' src={data.image ? `http://localhost:3001/uploads/${data.image}` : "https://via.placeholder.com/400"} alt="" />
              <div className='space-y-2'>
                <h2 className='text-lg font-semibold'>{data.name}</h2>
                <h4 className='text-gray-400'>Admin full Controll </h4>
              </div>
            </div>
            <button onClick={() => navi('/setting/edit')} className='rounded-3xl flex px-4 py-2 gap-1 border-2 items-center' >Edit <img width="28" className='hidden dark:block' height="28" src="https://img.icons8.com/pastel-glyph/28/FFFFFF/edit--v1.png" alt="edit--v1" /> <img width="28" className='block dark:hidden' height="28" src="https://img.icons8.com/pastel-glyph/64/1A1A1A/edit--v1.png" alt="edit--v1" /> </button>

          </div>
        </div>
        <h1 className='font-semibold text-lg  '> Personal Information</h1>
        <div className='p-8 px-14 border rounded-xl grid md:grid-cols-3 grid-cols-1 lg:grid-cols-3 space-y-3'>
          <div>
            <label htmlFor="" className='text-lg font-semibold text-gray-400 '>Full Name</label>
            <p className='text-xl'>{data.name}</p>
          </div>
          <div>
            <label htmlFor="" className='text-lg font-semibold text-gray-400 '>Email</label>
            <p className='text-xl'>{data.email}</p>
          </div>
          <div className='lg:row-span-3 order-last lg:order-none md:order-none md:row-span-3 justify-self-end'>
            <button onClick={() => navi('/setting/edit')} className='rounded-3xl flex px-4 py-2 gap-1 border-2 items-center' >Edit <img width="28" className='hidden dark:block' height="28" src="https://img.icons8.com/pastel-glyph/28/FFFFFF/edit--v1.png" alt="edit--v1" /> <img width="28" className='block dark:hidden' height="28" src="https://img.icons8.com/pastel-glyph/64/1A1A1A/edit--v1.png" alt="edit--v1" /> </button>

          </div>

          <div>
            <label htmlFor="" className='text-lg font-semibold text-gray-400 '>Phone Number</label>
            <p className='text-xl'>{data.phonenumber}</p>
          </div>
          <div>
            <label htmlFor="" className='text-lg font-semibold text-gray-400 '>Password</label>
            <p className='text-xl'>**********</p>
          </div>
          <div>
            <label htmlFor="" className='text-lg font-semibold text-gray-400 '>Role </label>
            <p className='text-xl'>Admin</p>
          </div>





        </div>
        <div className='p-8 border rounded-xl flex flex-wrap justify-between items-center '>
        <h1 className='font-semibold text-lg '> Add & View Admins</h1>
        <div className='flex gap-4'>

        <button onClick={()=> navi('/setting/view')} className='p-2 px-6  bg-[#000000d0] text-white hover:opacity-80  rounded-3xl'>View</button>

        <button onClick={()=>navi('/setting/add')} className='p-2 px-8 hover:opacity-80 text-white bg-gg rounded-3xl font-semibold text-lg' >Add</button>

        </div>
        </div>
      </div>


    </div>
  )
}

export default Setting
