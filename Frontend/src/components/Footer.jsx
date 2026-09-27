import React from 'react'
import { Link } from 'react-router-dom'
const Footer = () => {
    return (
        <footer class="text-gray border-t-2 body-font">
            <div class="container  px-5 py-24 mx-auto flex    md:items-center lg:items-center md:flex-row md:flex-nowrap flex-wrap flex-col">
                <div class="w-64 flex-shrink-0 md:mx-0 mx-auto text-center md:text-left">
                <Link to="/" className=''>
          <img className='h-1/2 w-1/2 object-cover rounded-br-[42px]' src="https://img.freepik.com/premium-vector/health-care-medical-logo-vector-design_990473-2554.jpg" alt="" />
          
          </Link>
                    <p class="mt-2 text-sm line-clamp-4 ">A healthcare hospital is a facility that provides medical and surgical treatment and nursing care for sick or injured people. It typically includes various departments such as emergency, surgery, pediatrics, cardiology, and more, equipped with advanced medical technology and staffed by healthcare professionals like doctors, nurses, and specialists. Hospitals aim to offer comprehensive care, from diagnosis to treatment and rehabilitation.</p>
                </div>
                <div class="flex-grow flex-col flex flex-wrap md:pl-20 gap-2 -mb-10 md:mt-0 mt-10 md:text-left text-center">

                    {/* <div class="lg:w-1/4 md:w-1/2 w-full px-4"> */}
                        <h2 class="title-font font-medium  tracking-widest text-sm mb-3">Use Full Links: </h2>
                        <nav class="list-none  flex-col    flex-wrap flex  gap-10 mb-10">
                            <li>
                                <Link to={'/'}>Home</Link>
                            </li>
                            <li>
                                <Link to={'/contact'}>Contact Us</Link>
                            </li>
                            <li>
                                <Link to={'/about'}>About</Link>
                            </li>
                            <li>
                                <Link to={'/login'}>Login</Link>
                            </li>
                        </nav>
                    {/* </div> */}

                </div>
            </div>

        </footer>
    )
}

export default Footer
