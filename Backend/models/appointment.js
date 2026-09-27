const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  fatherName: { type: String, required: true },
  phoneNumber: { type: String, required: true },
  maritalStatus: { type: String, required: true},
  gender: { type: String, required: true, },
  bloodGroup: { type: String, required: true },
  age: { type: Number, required: true},
  department: { type: String, required: true },
  doctor: { type: String, required: true },
  appointmentDate: { type: Date, required: true },
  appointmentTime: { type: String, required: true },
  status: { type: String }

});

const Appointment = mongoose.model('Appointments', appointmentSchema);
module.exports = Appointment;
