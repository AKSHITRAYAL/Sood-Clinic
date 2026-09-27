import React from 'react'
// import Navbar from '../Components/Navbar'
import Navbar from './Components/Navbar'
import axios from 'axios'
import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
const Doctor = () => {
  const [data, setData] = useState([])
  const getdata = () => {
    axios.get('http://localhost:3001/getdoctor')
      .then((res) => {
        console.log(res)
        setData(res.data)
      })
      .catch((er) => { console.log(err) })
  }

  useEffect(() => {

  
    getdata()
  }, [])
  return (
    <div>
      <Navbar></Navbar>
<h1 className='text-3xl container mx-auto' >All Doctors</h1>
        <div class="container px-5 py-5 mx-auto">

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
