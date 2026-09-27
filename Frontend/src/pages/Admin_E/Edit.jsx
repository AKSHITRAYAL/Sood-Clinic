import React from 'react'
import Navbar from './Components/Navbar'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
const Edit = () => {
    
    const navi = useNavigate()
    const fileInputRef = useRef(null);
    const [passwordeye, setPasswordeye] = useState('https://img.icons8.com/ios/50/closed-eye.png')
    const [passwordtype, setPasswordtype] = useState("password")
    const [profile, setProfile] = useState('')
    const id = localStorage.getItem('adminid')
    const [image, setimage] = useState('')
    const [data, setData] = useState({})
    const [profilePic,setProfilePic]= useState()
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

            // You can use the file here or store it in state if needed
        }
    };
    const [password, setPassword] = useState('')
    const [newpassword,setNewpassword]= useState('')
    const [name, setName] = useState('Loading...')
    const [email, setEmail] = useState('Loading...')
    const [gender, setGender] = useState('Loading')
    const [phonenumber, setPhonenumber] = useState('Loading...')
    const getdata = (id) => {
        axios.post('http://localhost:3001/admindata', { id })
            .then((res) => {
                console.log(res)
                setData(res.data)
                setEmail(res.data.email)
                setName(res.data.name)
                setPhonenumber(res.data.phonenumber)
                // setimage(res.data.image)
                setTempurl(`http://localhost:3001/uploads/${res.data.image}`)




            })
            .catch((err) => { console.log(err) })
    }
    useEffect(() => {
        if (id) {

            getdata(id)

            if(profile !== ''){
                window.scroll(0,0)
                setTimeout(() => {
                    setProfile('')
                }, 4000);
            }
        }


    }, [profile])
    const handelsubmit = async (e) =>{
        console.log('post gone')
        const formData = new FormData();
        formData.append('id', id);
        formData.append('name', name);
        formData.append('email', email);
        formData.append('phonenumber', phonenumber);
        
        // Append the profilePic (make sure the file input is named 'profilePic' in the form)
        if (profilePic) {
          formData.append('profilePic', profilePic); // 'profilePic' should match the name in multer
        }
        e.preventDefault();
        try {
            const response = await axios.post('http://localhost:3001/adminupdate', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
              
            });
            if(response.data){
                setProfile('Profile Updated Successfully!')
            }
            console.log(response.data);
          } catch (error) {
            console.error('Error Updating admin:', error);
          }

    }
    const handelpassword = async (e) =>{
        e.preventDefault();
        try {
            const response = await axios.post('http://localhost:3001/adminpass',  {id, password, newpassword});
            if(response.data.message === 'success'){
                window.scroll(0,0)

                setProfile('Password Updated Successfully!')

                setProfile('Password Updated Successfully!')
            }else if(response.data.status==='nopass'){
                window.scroll(0,0)
                setProfile('Invalid current Password')
                
            }

            console.log(response);
          } catch (error) {
                setProfile('Error Updateding...')

            console.error('Error Updating admin:', error);
          }


    }



    const handeleye = () => {
        if (passwordeye == 'https://img.icons8.com/ios/50/closed-eye.png') {
            setPasswordtype('text')
            setPasswordeye('https://img.icons8.com/pastel-glyph/64/surprise--v1.png')
        } else {
            setPasswordtype('password')
            setPasswordeye('https://img.icons8.com/ios/50/closed-eye.png')
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

                        {/* <img className='w-[160px] h-[160px] object-cover rounded-full' src={image ? `http://localhost:3001/uploads/${image}`: "https://via.placeholder.com/400"} alt="" /> */}
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
                    <label htmlFor="" className='text-lg font-semibold text-gray-400 '>Email:</label>
                    <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className='p-3  border dark:border-none rounded-lg appearance-none' />



                    <div className=' mt-5 flex flex-wrap gap-4 justify-end items-center'>
                        <button onClick={handelsubmit} className='p-3 px-6 hover:opacity-80 text-white bg-gg rounded-3xl'>Update</button>
                        <button onClick={()=> navi('/setting')} className='p-3 px-6  bg-[#000000d0] text-white hover:opacity-80  rounded-3xl'>Cancel</button>
                    </div>




                </div>
                <h1 className='font-semibold text-lg '> Security</h1>

                <div className='p-8 space-y-2 border-2 flex flex-col rounded-xl '>
                    <label htmlFor="" className='text-lg font-semibold text-gray-400 '>Current password:</label>
                    {/* <input type="password" className='p-3  border dark:border-none rounded-lg appearance-none' /> */}
                    <div className='w-full relative'>
                        <input required type={passwordtype} className=' p-3  w-full border dark:border-none rounded-lg '
                            onChange={(e) => setPassword(e.target.value)}
                        />
                        <div className='p-[3px] absolute rounded-t-md top-[7px]     right-8  '>

                            <img
                                className=" object-cover  "
                                src={passwordeye} // Path to your image
                                alt="Description of image"

                                width={30}
                                onClick={handeleye}
                                height={30}
                            // layout='responsive'
                            />

                        </div>
                    </div>
                    <label htmlFor="" className='text-lg font-semibold text-gray-400 '>New password:</label>

                    {/* <input type="password" className='p-3  border dark:border-none rounded-lg appearance-none' /> */}
                    <div className='w-full relative'>
                        <input required type={passwordtype} className=' p-3  w-full border dark:border-none rounded-lg '
                            onChange={(e) => setNewpassword(e.target.value)}
                        />
                        <div className='p-[3px] absolute rounded-t-md top-[7px]     right-8 '>

                            <img
                                className=" object-cover  "
                                src={passwordeye} // Path to your image
                                alt="Description of image"

                                width={30}
                                onClick={handeleye}
                                height={30}
                            // layout='responsive'
                            />

                        </div>
                    </div>
                    <div className=' mt-5 flex flex-wrap gap-4 justify-end items-center'>
                        <button onClick={handelpassword} className='p-3 px-6 hover:opacity-80 text-white bg-gg rounded-3xl'>Update</button>
                        <button onClick={()=> navi('/setting')} className='p-3 px-6  bg-[#000000d0] text-white hover:opacity-80  rounded-3xl'>Cancel</button>
                    </div>

                </div>

            </div>
        </>
    )
}

export default Edit
