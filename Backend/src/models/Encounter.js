const mongoose = require('mongoose');

const diagnosisSchema = new mongoose.Schema({ code: String, display: { type: String, required: true }, primary: { type: Boolean, default: false } }, { _id: false });
const prescriptionSchema = new mongoose.Schema({ medication: { type: String, required: true }, dose: String, frequency: String, duration: String, instructions: String }, { _id: false });
const encounterSchema = new mongoose.Schema({
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
  appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true, unique: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'DoctorProfile', required: true, index: true },
  vitals: { bloodPressure: String, temperatureC: Number, pulse: Number, weightKg: Number, heightCm: Number, recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, recordedAt: Date },
  chiefComplaint: { type: String, trim: true, maxlength: 2000 },
  clinicalNotes: { type: String, trim: true, maxlength: 10000 },
  diagnoses: { type: [diagnosisSchema], default: [] },
  prescriptions: { type: [prescriptionSchema], default: [] },
  status: { type: String, enum: ['draft', 'signed', 'amended'], default: 'draft' },
  signedAt: Date,
  signedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, versionKey: 'version' });
encounterSchema.index({ patient: 1, createdAt: -1 });
module.exports = mongoose.model('Encounter', encounterSchema);
