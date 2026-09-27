import React from 'react'
import Navbar from '../components/Navbar'
import NoticeSlider from '../components/Slider'
import Card from '../components/card'
import{ ReviewSection,ServicesSection} from '../components/rev'
import Contact from './Contact'
import Footer from '../components/Footer'
import { useState, useEffect } from 'react'
import axios from 'axios'


const Home = () => {
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
    <>
    <Navbar/>
      
    <div>
      
      <NoticeSlider
      
      
      
      />

      <div className='my-5 border-b-2 lg:block hidden'></div>
    <ServicesSection/>
      <h1 className='md:text-4xl text-2xl text-center lg:text-6xl container mx-auto w-full font-semibold'>
      Our  Doctors
      </h1>
      <Card
      notices ={data}
      
      />
      <ReviewSection/>

    </div>
    <Footer/>
    </>
  )
}

export default Home
