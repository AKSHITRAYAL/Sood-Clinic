import React from 'react'
import { Link, NavLink } from 'react-router-dom'
import { ModeToggle } from '../../../components/ModeToggle'
import { useState, useEffect } from 'react';

const Navbar = () => {
    const [profile1, setProfile1] = useState({ display: 'none' });
    const [menuico, setMenuico] = useState('https://img.icons8.com/ios-filled/50/FFFFFF/menu--v1.png');

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


            setMenuico('https://img.icons8.com/ios-filled/50/FFFFFF/multiply.png')

        } else {
            setMenuico('https://img.icons8.com/ios-filled/50/FFFFFF/menu--v1.png')

            setProfile1({ display: 'none' })

        }
    }

    const handellogout = () => {
        localStorage.removeItem('doctoken');
        window.location.reload(true);



    }
    return (
        <div className='relative z-[100]'>
            <nav className='bg-gg flex gap-6  md:justify-around justify-between lg:justify-around items-center w-full h-[80px] '>

                <Link to={'/'} className=' bg-white md:px-10 px-0 lg:px-5 border rounded-br-[42px] h-full'>
                    <img className='h-full object-cover rounded-br-[42px]' src="https://img.freepik.com/premium-vector/health-care-medical-logo-vector-design_990473-2554.jpg" alt="" />


          
                </Link>
          <button onClick={handelmenu} className='w-10 h-10 lg:hidden md:hidden' ><img src={menuico} width={25} height={25} className='active:rotate-180 duration-75 transition-all ease-in'  alt="Menu Icon " /></button>

                <div className='hidden md:flex lg:flex gap-6  items-center justify-center'>
                    <NavLink to='/' className={(e) => { return e.isActive ? 'border-b-2' : '' }}>
                        <img width="32" height="32" src="https://img.icons8.com/ios-filled/50/FFFFFF/home.png" alt="home" />
                    </NavLink>
                    <NavLink to='/doc/Doctors' className={(e) => { return e.isActive ? 'border-b-2 pb-1' : 'pb-1 hover:scale-110  transition-all ease-in' }}>
                        <img width="32" height="32" src="https://img.icons8.com/ios-filled/50/FFFFFF/medical-doctor.png" alt="settings" />
                    </NavLink>
                    {/* <NavLink to='/receptionist' className={(e) => { return e.isActive ? 'border-b-2 pb-1' : 'pb-1 hover:scale-110  transition-all ease-in' }}>
                        <img width="32" height="32" src="https://img.icons8.com/ios-filled/50/FFFFFF/front-desk.png" alt="settings" />
                    </NavLink>
                    <NavLink to='/messages' className={(e) => { return e.isActive ? 'border-b-2' : 'hover:animate-bounce transition-all ease-in' }}>
                        <img width="34" height="34" src="https://img.icons8.com/sf-black-filled/64/FFFFFF/messaging-.png" alt="settings" />
                    </NavLink> */}
                    <NavLink to='/doc/department' className={(e) => { return e.isActive ? 'border-b-2' : 'hover:animate-pulse transition-all ease-in' }}>
                        <img width="34" height="34" src="https://img.icons8.com/ios-filled/50/FFFFFF/org-unit.png" alt="settings" />
                    </NavLink>
                    {/* <NavLink to='/appointment' className={(e) => { return e.isActive ? 'border-b-2' : 'hover:animate-pulse transition-all ease-in' }}>
                        <img width="34" height="34" src="https://img.icons8.com/external-bartama-glyph-64-bartama-graphic/64/FFFFFF/external-appointment-graphic-design-glyph-bartama-glyph-64-bartama-graphic.png" alt="settings" />
                    </NavLink>  */}
                    <NavLink to='/doc/setting' className={(e) => { return e.isActive ? 'border-b-2' : 'hover:rotate-[44deg] active:rotate-[24deg] transition-all ease-in' }}>
                        <img width="32" height="32" src="https://img.icons8.com/ios-filled/50/FFFFFF/settings.png" alt="settings" />
                    </NavLink>
                    
                    
                    
                </div>
                <div className='md:flex hidden lg:flex items-center gap-4'>
                    <button onClick={handellogout} type="button" className='text-white px-5 flex py-6 w-auto  font-semibold bg-bb hover:bg-[#0098ac]'> Logout</button>
                    <ModeToggle />

                </div>



            </nav>
            <div style={profile1} className='w-full lg:hidden md:hidden text-white bg-gg transition-all duration-500 ease-in-out absolute  top-[100%] left-0 flex-col z-10 rounded-b-lg'>
                <NavLink to='/' className='px-5 flex py-4 w-full bg-gg hover:bg-[#0098ac]' >Home  </NavLink>
                {/* <NavLink to='/receptionist' className='px-5 flex py-4 w-full bg-gg hover:bg-[#0098ac]' >Receptionist </NavLink> */}
                <NavLink to='/doc/Doctors' className='px-5 flex py-4 w-full bg-gg hover:bg-[#0098ac]' >Doctors </NavLink>
                <NavLink to='/doc/department' className='px-5 flex py-4 w-full bg-gg hover:bg-[#0098ac]' >Departments </NavLink>
                {/* <NavLink to='/messages' className='px-5 flex py-4 w-full bg-gg hover:bg-[#0098ac]' >Messages </NavLink> */}
                {/* <NavLink to='/appointment' className='px-5 flex py-4 w-full bg-gg hover:bg-[#0098ac]' >Appointment </NavLink> */}

                <NavLink to='/setting' className='px-5 flex py-4 w-full bg-gg hover:bg-[#0098ac]' >Setting </NavLink>
                


                <button onClick={handellogout} className='px-5 flex py-4 w-full border-t-2 bg-gg hover:bg-[#0098ac]'> Logout</button>
                <div className='bg-gg w-1/12 mx-5 py-2'>
                <ModeToggle />

                </div>







            </div>


        </div>
    )
}

export default Navbar
