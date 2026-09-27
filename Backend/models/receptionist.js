const mongoose = require('mongoose')

const ReceptionistSchema = new mongoose.Schema({


    name: {
        type: String,
        required: true,
    },
    
    shiftTiming: {
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



const ReceptionistModel = mongoose.model("receptionist", ReceptionistSchema)
module.exports = ReceptionistModel