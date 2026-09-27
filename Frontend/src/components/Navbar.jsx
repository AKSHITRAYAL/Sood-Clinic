import React, { useRef, useState, useEffect } from 'react';
import menu from '../assets/svgs/menu.svg';

import axios from 'axios'

import cross from '../assets/images/cross.png'
import { Link, NavLink } from 'react-router-dom';
import { ModeToggle } from './ModeToggle'


const Navbar = () => {

  const [data, setData] = useState([])
  const [status, setStatus] = useState()

  const [profile1, setProfile1] = useState({ display: 'none' });
  const token = localStorage.getItem('admintoken')
  const [menuico, setMenuico] = useState(menu);
  const getdata = () => {
    axios.get('http://localhost:3001/getadmin')
      .then((res) => {
        console.log('fuck')
        console.log(res)
        if (res.data.length === 0) {
          setStatus(true)

        } else {
          setStatus(false)

        }
      })
       .catch((er) => { console.error(er) })
  }
  useEffect(() => {
    getdata()
  }, [])




  useEffect(() => {
    if (profile1.display == 'flex') {

      document.body.style.overflow = 'hidden';

    } else {
      document.body.style.overflow = 'auto';

    }

    // Cleanup the scroll style when component unmounts or popup closes
    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [profile1]);

  const handelmenu = () => {
    if (profile1.display == 'none') {

      setProfile1({ display: 'flex' })


      setMenuico(cross)

    } else {
      setMenuico(menu)

      setProfile1({ display: 'none' })

    }
  }

  const handellogout = () => {
    localStorage.removeItem('admintoken');
    window.location.reload(true);



  }

  return (
    <>


      <nav className='  relative  bg-gg  w-full text-white '>

        <div className='h-[90px]  px-2 container mx-auto z-50  w-full  bg-gg  flex items-center justify-between   '>
          <Link to="/" className=' bg-white md:px-10 px-0 lg:px-10 border rounded-br-[42px] h-full'>
            <img className='h-full object-cover rounded-br-[42px]' src="https://img.freepik.com/premium-vector/health-care-medical-logo-vector-design_990473-2554.jpg" alt="" />

          </Link>
          <button onClick={handelmenu} className='w-10 h-10 lg:hidden md:hidden' ><img src={menuico} width={25} height={25} className='active:rotate-180 duration-75 transition-all ease-in' alt="Menu Icon" /></button>
          <div className=' hidden md:flex lg:flex items-center gap-5'>

            <div className='hidden  lg:block md:block'>
              <ul className='hidden lg:flex  md:flex  gap-1 text-lg items-center '>
                <NavLink to="/" className={(e) => { return e.isActive ? " bg-bb px-4 py-2 rounded-sm" : "transition-all duration-300 ease-in-out hover:bg-bb px-4 py-2" }} >Home</NavLink  >
                <NavLink to="/About" className={(e) => { return e.isActive ? " bg-bb px-4 py-2 rounded-sm" : "transition-all duration-300 ease-in-out  hover:bg-bb px-4 py-2" }} >About</NavLink  >
                <NavLink to="/contact" className={(e) => { return e.isActive ? " bg-bb px-4 py-2 rounded-sm" : "transition-all duration-300 ease-in-out  hover:bg-bb px-4 py-2 " }} >Contact Us</NavLink  >
                <NavLink to="/Booknow" className={(e) => { return e.isActive ? " bg-bb px-4 py-2 rounded-sm" : "transition-all duration-300 ease-in-out  hover:bg-bb px-4 py-2 " }} >Book Meeting</NavLink  >
                |

              </ul>
            </div>
            {
              token ? (

                <div className=' hidden lg:block md:block'>

                  <button onClick={handellogout} className='px-5 flex py-6 w-full bg-[rgb(13,12,67)] hover:bg-[#0098ac]'> Logout</button>

                </div>

              ) : (
                <div className=' hidden lg:block md:block'>

                  <ul className='hidden items-center  lg:flex md:flex gap-2'>
                    <Link to='/login' className='py-2 px-6  border-2  rounded-3xl hover:border-bb transition-all duration-500 hover:bg-bb cursor-pointer'>Login</Link>
                    {status ?

                      <Link to='/rigister' className='py-2 px-6  border-2  rounded-3xl hover:border-bb transition-all duration-500 hover:bg-bb cursor-pointer'>Rigister Admin</Link>
                      : ''
                    }

                    <div className='h-1/2 '>
                      <ModeToggle />

                    </div>
                  </ul>
                </div>

              )}
          </div>
        </div>
        <div style={profile1} className='w-full lg:hidden md:hidden border-t transition-all duration-500 ease-in-out absolute  top-[100%] left-0 flex-col z-10 rounded-b-lg'>
          <NavLink to='/' className='px-5 flex py-6 w-full bg-gg hover:bg-[#0098ac]' >Home  </NavLink>
          <NavLink to='/About' className='px-5 flex py-6 w-full bg-gg hover:bg-[#0098ac]' >About </NavLink>
          <NavLink to='/contact' className='px-5 flex py-6 w-full bg-gg hover:bg-[#0098ac]' >Cantact Us </NavLink>
          <NavLink to='/Booknow' className='px-5 flex py-6 w-full bg-gg hover:bg-[#0098ac]' >Book Appointment</NavLink>

          {
            token ? (

              <div className=''>
                <button onClick={handellogout} className='px-5 flex py-6 w-full border-t-2 bg-[rgb(13,12,67)] hover:bg-[#0098ac]'> Logout</button>

              </div>
            ) : (

              <div className='w-full flex flex-col'>

                <NavLink to={'/login'} className='px-5 py-4  bg-gg border-t-2 hover:bg-[#0098ac]' href="">Log in</NavLink>
              </div>
            )
          }





        </div>




      </nav>


    </>

  )
}

export default Navbar
