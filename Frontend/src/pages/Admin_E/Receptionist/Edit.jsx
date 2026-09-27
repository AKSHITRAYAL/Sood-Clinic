import React from 'react'
import Navbar from '../Components/Navbar'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useParams } from 'react-router-dom';
const Edit = () => {
    const times = [
        "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM",
        "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM",
        "6:00 PM","7:00 PM", "8:00 PM"
    ];
    const { id } = useParams();
    const [startTime, setStartTime] = useState("");
    const [endTime, setEndTime] = useState("");

    const navi = useNavigate()
    const fileInputRef = useRef(null);
    const [profile, setProfile] = useState('')
    const [profilePic, setProfilePic] = useState()
    const [tempurl, setTempurl] = useState('')
    const handleButtonClick = () => {
        fileInputRef.current.click();
    }
    const handleFileChange = (event) => {
        const selectedFile = event.target.files[0];
        if (selectedFile) {
            console.log(selectedFile);
            setProfilePic(selectedFile)
            setTempurl(URL.createObjectURL(selectedFile))
        }
    };
    const [name, setName] = useState('Loading...')
    const [email, setEmail] = useState('Loading...')
    const [phonenumber, setPhonenumber] = useState()
    const [shiftTiming, setShiftTiming] = useState('Loading...')
    const [age, setAge] = useState('Loading...')
    


    const getdata = (id) => {
        axios.post('http://localhost:3001/repdata', { id })
            .then((res) => {
                console.log(res)
                setEmail(res.data.email)
                setName(res.data.name)
                setPhonenumber(res.data.phonenumber)
                // setimage(res.data.image)
                setTempurl(`http://localhost:3001/uploads/${res.data.image}`)
                setShiftTiming(res.data.shiftTiming)
                setAge(res.data.age)



            })
            .catch((err) => { console.log(err) })
    }
    useEffect(() => {
        if (id) {

            getdata(id)
            window.scroll(0, 0)
            if (profile !== '') {
                setTimeout(() => {
                    setProfile('')
                }, 4000);
            }
        }


    }, [profile])
    useEffect(() => {
        setShiftTiming(`${startTime} - ${endTime}`)

        
    }, [startTime,endTime])
    
    const handelsubmit = async (e) => {
        console.log('post gone')

        const formData = new FormData();
        formData.append('id', id);
        formData.append('name', name);
        formData.append('email', email);

        formData.append('shiftTiming', shiftTiming);

        // formData.append('spcialization', spcialization);
        formData.append('age', age);


        formData.append('phonenumber', phonenumber);

        if (profilePic) {
            console.log(profilePic)
            formData.append('profilePic', profilePic); // 'profilePic' should match the name in multer
        }
        e.preventDefault();
        try {
            const response = await axios.post('http://localhost:3001/repupdate', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },

            });
            if (response.data) {
                setProfile('Profile Updated Successfully!')
            }
            console.log(response.data);
        } catch (error) {
            console.error('Error Updating admin:', error);
        }

    }




    return (
        <>
            <Navbar></Navbar>
            <div className='container mx-auto py-6 space-y-5 px-2'>
                <h1 className='font-semibold text-lg '> Edit Profile</h1>
                <label htmlFor="" className='text-xl text-red-600 '>{profile}</label>
                <div className='p-8 space-y-2 flex-wrap justify-center flex border items-center md:justify-between gap-3 lg:justify-between rounded-xl '>

                    <div className='w-[160px] h-[160px] rounded-full  '>

                        <img className='w-[160px] h-[160px] object-cover rounded-full' src={tempurl ? tempurl :"https://via.placeholder.com/400"}
                            alt="" />

                    </div>
                    <button onClick={handleButtonClick} className='rounded-3xl h-12  flex px-4 py-2 gap-1 border-2 items-center' >Change <img width="28" className='hidden dark:block' height="28" src="https://img.icons8.com/pastel-glyph/28/FFFFFF/edit--v1.png" alt="edit--v1" /> <img width="28" className='block dark:hidden' height="28" src="https://img.icons8.com/pastel-glyph/64/1A1A1A/edit--v1.png" alt="edit--v1" /> </button>
                    <input
                        type="file"
                        name="profilePic"
                        ref={fileInputRef}
                        onChange={handleFileChange}
                        style={{ display: 'none' }}
                    />


                </div>
                <h1 className='font-semibold text-lg '> Personal Info</h1>

                <div className='p-8 space-y-2 border-2 flex flex-col rounded-xl '>
                    <label htmlFor="" className='text-lg font-semibold text-gray-400 '>Name:</label>


                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} className='p-3 border dark:border-none  rounded-lg' />


                    <label htmlFor="" className='text-lg font-semibold text-gray-400 '>Phone Number:</label>
                    <input type="number" value={phonenumber} onChange={(e) => setPhonenumber(e.target.value)} className='p-3  border dark:border-none rounded-lg appearance-none' />
                    <div className='flex flex-wrap gap-5 '>
                    <label htmlFor="" className='text-lg font-semibold text-gray-400 '>Current Shift Time:</label>
                    <label htmlFor="">{shiftTiming}</label>

                    
                    </div>
                    <label htmlFor="" className='text-lg font-semibold text-gray-400 '>Set New Shif Time:</label>

                    <div className='flex justify-around items-center flex-wrap gap-4'>
                                <label className="text-lg font-semibold dark:text-gray-400">Shift Start Time:</label>
                                <select   className='p-3' value={startTime} onChange={(e) => setStartTime(e.target.value)}>
                                    <option value="">Select  Time</option>
                                    {times.map((time) => (
                                        <option key={time} value={time}>{time}</option>
                                    ))}
                                </select>

                                <label className="text-lg font-semibold dark:text-gray-400">Shift End Time:</label>
                                <select  className='p-3'  value={endTime} onChange={(e) => setEndTime(e.target.value)}>
                                    <option value="">Select Time</option>
                                    {times.map((time) => (
                                        <option key={time} value={time}>{time}</option>
                                    ))}
                                </select>
                            </div>
                    {/* <input type="text" value={spcialization} onChange={(e) => setSpcialization(e.target.value)} className='p-3  border dark:border-none rounded-lg appearance-none' /> */}
                    <label htmlFor="" className='text-lg font-semibold text-gray-400 '>Age:</label>
                    <input type="text" value={age} onChange={(e) => setAge(e.target.value)} className='p-3  border dark:border-none rounded-lg appearance-none' />


                    <label htmlFor="" className='text-lg font-semibold text-gray-400 '>Email:</label>


                    <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className='p-3  border dark:border-none rounded-lg appearance-none' />



                    <div className=' mt-5 flex flex-wrap gap-4 justify-end items-center'>
                        <button onClick={handelsubmit} className='p-3 px-6 hover:opacity-80 text-white bg-gg rounded-3xl'>Update</button>
                        <button onClick={() => navi('/setting')} className='p-3 px-6  bg-[#000000d0] text-white hover:opacity-80  rounded-3xl'>Cancel</button>
                    </div>




                </div>

            </div>
        </>
    )
}

export default Edit
