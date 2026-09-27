const mongoose = require('mongoose')

const MessageSchema = new mongoose.Schema({


    name: {
        type: String,
    },
    email: {
        
        type: String,
    },




    title: {
        type: String,

    },
    message: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        default: Date.now, 
      },
    







})



const MessageModel = mongoose.model("message", MessageSchema)
module.exports = MessageModel