import React from 'react'
import Navbar from './Components/Navbar'
import axios from 'axios'
import { useState, useEffect } from 'react'

const Viewadmin = () => {
  const [data, setData] = useState([])
  const id = localStorage.getItem('adminid')

  const [profile, setProfile] = useState('')

  const getdata = () => {
    axios.get('http://localhost:3001/getadmin')
      .then((res) => {
        console.log(res)
        setData(res.data)
      })
      .catch((er) => { console.log(err) })
  }
  const handeldelete = (id) =>{
    axios.post('http://localhost:3001/admindelete',{id})
    .then((res) =>{console.log(res)
      if (res.data.status === 'success'){
        setProfile('Admin Deleted Successfully!')
      }else {
        setProfile('Admin not found')
      }


    })
    .catch((err)=> {console.log(err)})
  }
  useEffect(() => {
    if (profile !==''){
      window.scroll(0,0)
      setTimeout(() => {
          setProfile('')
      }, 2000);
  }
    getdata()
  }, [profile])

  return (
    <div>
      <Navbar></Navbar>

      <div className='container mx-auto py-6 space-y-5 px-2'>
        <h1 className='font-semibold text-lg '> All Admins</h1>
        <label htmlFor="" className='text-xl text-red-600 '>{profile}</label>

        <div className='p-8 space-y-2 flex-wrap justify-center flex  items-center md:justify-between gap-3 lg:justify-between rounded-xl '>
          {
            data.filter((item) => item._id !== id).map((data) => (


              <div className='p-2 flex flex-wrap gap-2  border   w-full rounded-xl items-center'>
                <img src={data.image ? `http://localhost:3001/uploads/${data.image}`: "https://via.placeholder.com/400"}  className='w-[80px] h-[80px] object-cover rounded-full border-2' alt="" />
                <h1>{data.name}</h1>
                ||
                <h2>{data.gender}</h2>
                <div className='justify-self-end flex-grow text-right'>
                  <button onClick={() => handeldelete(data._id)} className='p-2 px-6  bg-[#000000d0] text-white hover:opacity-80  rounded-3xl'>Delete</button>

                </div>
              </div>
            ))}


        </div>
      </div>

    </div>
  )
}

export default Viewadmin
