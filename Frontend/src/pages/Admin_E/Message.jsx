import React from 'react'
import { useState, useEffect } from "react";
import axios from 'axios'
import { format } from 'date-fns';

import Navbar from './Components/Navbar'
const Message = () => {
    const [profile, setProfile] = useState('')
    const [data, setData] = useState([])


    const getdata = () => {
        axios.get('http://localhost:3001/getmessages')
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
    const handeldelete = (id) =>{
        axios.post('http://localhost:3001/messagedel',{id})
        .then((res) =>{console.log(res)
          if (res.data.status === 'success'){
            setProfile('Message Deleted Successfully!')
          }else {
            setProfile('Message not found')
          }
    
    
        })
        .catch((err)=> {console.log(err)})
      }
    return (
        <div>
            <Navbar></Navbar>

            <div className="container mx-auto w-full space-y-4  my-4 p-4 rounded-xl">
                <label htmlFor="" className="text-xl text-red-600">{profile}</label>

                {
                    data.map((data) => (

                        <div className='border relative rounded-lg p-2 flex gap-4' >
                            <button onClick={()=>handeldelete(data._id)} className='w-[36px] h-[36px] absolute top-6 right-4'>

                                <img className='w-[36px] h-[36px] absolute top-6 right-4' src="https://img.icons8.com/external-flatart-icons-lineal-color-flatarticons/64/external-dustbin-smart-home-flatart-icons-lineal-color-flatarticons.png" alt="" />
                            </button>
                            <img className='rounded-full hidden lg:block md:block w-[80px] h-[80px] object-cover' src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQssCoqqHE5us2-BV1ZqITfC5zt9t1sA82Abg&s" alt="" />
                            <div className='flex flex-col  justify-center gap-4 '>
                                <div className="flex gap-1 flex-col -center">

                                    <h1 className='text-2xl '>{data.title}</h1><span className='text-sm text-gray-500'>{format(new Date(data.date), 'MMM dd yyyy')}</span>
                                    <p className='space-x-2 '><span className='font-semitbold text-xl'>From : </span>{data.name? data.name :'Unknown'}   <span className='font-semitbold text-xl'>Email :</span> {data.email?data.email:'Unknown'} </p>

                                </div>
                                <div className='text-sm dark:text-gray-400 '>
                                    {data.message}
                                </div>
                            </div>
                        </div>
                    ))}

            </div>
        </div>
    )
}

export default Message
