import React from 'react'
import Navbar from '../Components/Navbar'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
const Doctor = () => {
  const [data, setData] = useState([])
  const [profile, setProfile] = useState('')

  const navi = useNavigate()
  const getdata = () => {
    axios.get('http://localhost:3001/getdoctor')
      .then((res) => {
        console.log(res)
        setData(res.data)
      })
      .catch((er) => { console.log(err) })
  }
  const handeldelete = (id) =>{
    axios.post('http://localhost:3001/docdelete',{id})
    .then((res) =>{console.log(res)
      if (res.data.status === 'success'){
        setProfile('Doctor Deleted Successfully!')
      }else {
        setProfile('Doctor not found')
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
      <div className='p-8 border rounded-xl  mt-6 flex flex-wrap container mx-auto justify-between items-center '>
        <h1 className='font-semibold text-lg '> Add Doctors</h1>
        <div className='flex gap-4'>


        <button onClick={()=>navi('/doctors/adddoctor')} className='p-2 px-8 hover:opacity-80 text-white bg-gg rounded-3xl font-semibold text-lg' >Add</button>

        </div>
        </div>
        <div class="container px-5 py-5 mx-auto">
        <label htmlFor="" className="text-xl text-red-600">{profile}</label>

          <div class="flex flex-wrap justify-around space-y-5 ">
            {
              data.map((data) =>(

             
            <div class="px-6 border rounded-xl h-auto lg:mb-0 mb-6 p-2">
              <div class="h-full flex flex-col items-center justify-center text-center">
                <img alt="testimonial" class="w-[200px] h-[200px] mb-2object-cover object-center object-cover rounded-full inline-block border-2 border-gray-200 bg-gray-100" src={data.image?`http://localhost:3001/uploads/${data.image}`:"https://dummyimage.com/302x302"} />
                {/* <p class="leading-relaxed">Edison bulb retro cloud bread echo park, helvetica stumptown taiyaki taxidermy 90's cronut +1 kinfolk. Single-origin coffee ennui shaman taiyaki vape DIY tote bag drinking vinegar cronut adaptogen squid fanny pack vaporware.</p> */}
                <span class="inline-block h-1 w-10 rounded bg-gray-700 dark:bg-white mt-6 mb-4"></span>
                <h2 class=" font-medium title-font tracking-wider text-sm">{data.name}</h2>
                <p class="">{data.spcialization}</p>
                <div className='w-full flex justify-between px-3 gap-3 mt-4 '>
                  <Link to={`/doctors/Editdoctor/${data._id}`}className='rounded-3xl flex px-4 py-1 gap-1 border-2 items-center' >Edit <img width="24" className='hidden dark:block' height="28" src="https://img.icons8.com/pastel-glyph/28/FFFFFF/edit--v1.png" alt="edit--v1" /> <img width="28" className='block dark:hidden' height="28" src="https://img.icons8.com/pastel-glyph/64/1A1A1A/edit--v1.png" alt="edit--v1" /> </Link>
                  <button onClick={()=>handeldelete(data._id)} className='p-2 px-6  bg-[#000000d0] text-white hover:opacity-80  rounded-3xl'>Delete</button>


                </div>
              </div>


            </div>
             ))
            }

          </div>
        </div>
    </div>
  )
}

export default Doctor
