const mongoose = require('mongoose')

const DoctorSchema = new mongoose.Schema({


    name: {
        type: String,
        required: true,
    },
    
    spcialization: {
        type: String,
    },

    
    address: {
        type: String,
    },
    
    bg: {
        type: String,
    },
    
    age: {
        type: String,
    },

    email: {
        
        type: String,
        unique: true,  
        required: true,
    },
    phonenumber :{
        type:String
    },
    gender:{
        type:String
    },


    password: {
        type: String,
        required: true,
    },
    image: {
        type: String
    },
    date: {
        type: Date,
        default: Date.now, 
      },
    







})



const DoctorModel = mongoose.model("doctor", DoctorSchema)
module.exports = DoctorModel