import React from 'react'
import Navbar from '../Components/Navbar'
import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { specializationOptions } from '../../../constants/specializations'

const Adddoctor = () => {
    const [passwordeye, setPasswordeye] = useState('https://img.icons8.com/ios/50/closed-eye.png')
    const [passwordtype, setPasswordtype] = useState("password")
    const [profile, setProfile] = useState('')
    const [image, setImage] = useState('')

    const navi = useNavigate()
    const fileInputRef = useRef(null);
    const [password, setPassword] = useState('')
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [gender, setGender] = useState('')
    const [phonenumber, setPhonenumber] = useState('')
    const [profilePic, setProfilePic] = useState()
    const [spcialization, setSpcialization] = useState('')
    const [isCustomSpecialization, setIsCustomSpecialization] = useState(false)
    const [address, setAddress] = useState()
    const [bg, setBg] = useState()
    const [age, setAge] = useState()
    const [data, setData] = useState([])
    const specializations = specializationOptions(data)


    const handleButtonClick = () => {
        fileInputRef.current.click();
    }
    const handleFileChange = (event) => {
        const selectedFile = event.target.files[0];
        if (selectedFile) {
            console.log(selectedFile);
            setProfilePic(selectedFile);
            setImage(URL.createObjectURL(selectedFile));
        }
    };
    const handelsubmit = async (e) => {
        e.preventDefault()
        console.log('post gone')
        const formData = new FormData();
        formData.append('name', name);
        formData.append('email', email);
        formData.append('gender', gender);
        formData.append('phonenumber', phonenumber);
        formData.append('password', password);
        formData.append('spcialization', spcialization);
        formData.append('address', address);
        formData.append('bg', bg);

        formData.append('age', age);





        if (profilePic) {
            formData.append('profilePic', profilePic);
        }
        try {
            const response = await axios.post('http://localhost:3001/docrigister', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },

            });
            if (response.data.status === 'success') {
                setProfile('Doctor Added Successfully!')
            } else if (response.data.status === 'already') {

                setProfile('Doctor already exist with this email..')

            } else {
                setProfile('Server Error')

            }
            console.log(response.data);
        } catch (error) {
            console.error('Error adding admin:', error);
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
    const getdata = () => {
        axios.get('http://localhost:3001/getdep')
            .then((res) => {
                console.log(res)
                setData(res.data)
            })
            .catch((er) => { console.log(err) })
    }

    useEffect(() => {
        getdata()
        if (profile !== '') {
            window.scroll(0, 0)
            setTimeout(() => {
                setProfile('')
            }, 4000);


        }
    }, [profile])

    return (
        <>
            <div>
                <Navbar />
                <div className="container mx-auto py-6 space-y-5 px-2">
                    <h1 className="font-semibold text-lg">Add Doctor</h1>
                    <form onSubmit={handelsubmit}>
                        <label htmlFor="" className="text-xl text-red-600">{profile}</label>

                        <div className="p-8 space-y-2 flex-wrap flex-col flex border i gap-3 rounded-xl">
                            <div className="flex items-center md:justify-between gap-4 lg:justify-between flex-wrap justify-center">
                                <div className="w-[160px] h-[160px] rounded-full">
                                    <img
                                        className="w-[160px] h-[160px] object-cover rounded-full"
                                        src={image ? image : "https://via.placeholder.com/400"}
                                        alt=""
                                    />
                                </div>

                                <button onClick={handleButtonClick} type="button" className="rounded-3xl h-12 flex px-4 py-2 gap-1 border-2 items-center">
                                    Add
                                    <img width="28" className="hidden dark:block" height="28" src="https://img.icons8.com/pastel-glyph/28/FFFFFF/edit--v1.png" alt="edit" />
                                    <img width="28" className="block dark:hidden" height="28" src="https://img.icons8.com/pastel-glyph/64/1A1A1A/edit--v1.png" alt="edit" />
                                </button>
                            </div>

                            <input
                                type="file"
                                name="profilePic"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                style={{ display: 'none' }}
                            />

                            <label htmlFor="" className="text-lg font-semibold dark:text-gray-400">Name:</label>
                            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="p-3 border dark:border-none rounded-lg" />

                            <label htmlFor="" className="text-lg font-semibold dark:text-gray-400">Phone Number:</label>
                            <input type="number" value={phonenumber} onChange={(e) => setPhonenumber(e.target.value)} className="p-3 border dark:border-none rounded-lg appearance-none" />
                            <label htmlFor="specialization" className="text-lg font-semibold dark:text-gray-400">Specialization:</label>
                            <select
                                id="specialization"
                                required
                                value={isCustomSpecialization ? '__custom__' : spcialization}
                                onChange={(e) => {
                                    const custom = e.target.value === '__custom__';
                                    setIsCustomSpecialization(custom);
                                    setSpcialization(custom ? '' : e.target.value);
                                }}
                                className='p-3 border dark:border-none rounded-lg'
                            >
                                <option value="">Select specialization</option>
                                {specializations.map((specialization) => <option key={specialization} value={specialization}>{specialization}</option>)}
                                <option value="__custom__">Other — enter a custom specialization</option>
                            </select>
                            {isCustomSpecialization && <input required type="text" value={spcialization} onChange={(e) => setSpcialization(e.target.value)} placeholder="Enter specialization" className="p-3 border dark:border-none rounded-lg" />}

                            <label htmlFor="" className="text-lg font-semibold dark:text-gray-400">Address:</label>
                            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="p-3 border dark:border-none rounded-lg" />
                            <label htmlFor="" className="text-lg font-semibold dark:text-gray-400">Blood Group:</label>

                            <input type="text" value={bg} onChange={(e) => setBg(e.target.value)} className="p-3 border dark:border-none rounded-lg" />
                            <label htmlFor="" className="text-lg font-semibold dark:text-gray-400">Age:</label>
                            <input type="number" value={age} onChange={(e) => setAge(e.target.value)} className="p-3 border dark:border-none rounded-lg appearance-none" />






                            <label htmlFor="" className="text-lg font-semibold dark:text-gray-400">Select the gender:</label>
                            <div className="flex flex-wrap gap-3 items-center justify-center">
                                <input type="radio" name="gender" value="Male" required className="pt-2 focus:outline-none px-2 border-gray-700 bg-transparent border-x-0 border-t-0 border-b-2" onChange={(e) => setGender(e.target.value)} />
                                <label htmlFor="Email" className="font-medium text-sm">Male</label>

                                <input type="radio" name="gender" value="Female" required className="pt-2 focus:outline-none px-2 border-gray-700 bg-transparent border-x-0 border-t-0 border-b-2" onChange={(e) => setGender(e.target.value)} />
                                <label htmlFor="Email" className="font-medium text-sm">Female</label>

                                <input type="radio" name="gender" value="other" required className="pt-2 focus:outline-none px-2 border-gray-700 bg-transparent border-x-0 border-t-0 border-b-2" onChange={(e) => setGender(e.target.value)} />
                                <label htmlFor="Email" className="font-medium text-sm">Other</label>
                            </div>

                            <label htmlFor="" className="text-lg font-semibold dark:text-gray-400">Email:</label>
                            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="p-3 border dark:border-none rounded-lg appearance-none" />

                            <label htmlFor="" className="text-lg font-semibold dark:text-gray-400">Password:</label>
                            <div className="w-full relative">
                                <input required type={passwordtype} className="p-3 w-full border dark:border-none rounded-lg" onChange={(e) => setPassword(e.target.value)} />
                                <div className="p-[3px] absolute rounded-t-md top-[7px] right-8">
                                    <img
                                        className="object-cover"
                                        src={passwordeye}
                                        alt="Toggle visibility"
                                        width={30}
                                        onClick={handeleye}
                                        height={30}
                                    />
                                </div>
                            </div>

                            <div className="mt-5 flex flex-wrap gap-4 justify-end items-center">
                                <input type="submit" className="p-3 px-6 hover:opacity-80 text-white bg-gg rounded-3xl" value="Add" />
                                <button onClick={() => navi('/setting')} className="p-3 px-6 bg-[#000000d0] text-white hover:opacity-80 rounded-3xl">Cancel</button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>

        </>
    )
}

export default Adddoctor
