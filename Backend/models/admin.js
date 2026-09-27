const mongoose = require('mongoose')

const AdminSchema = new mongoose.Schema({


    name: {
        type: String,
        required: true,
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



const AdminModel = mongoose.model("admin", AdminSchema)
module.exports = AdminModel