const mongoose = require('mongoose');

const patientSchema = new mongoose.Schema({
  identifier: { type: String, required: true, trim: true, uppercase: true },
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
  portalUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true, sparse: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  dateOfBirth: { type: Date },
  gender: { type: String, enum: ['female', 'male', 'other', 'unknown'], default: 'unknown' },
  contact: { phone: { type: String, required: true, trim: true }, email: { type: String, trim: true, lowercase: true } },
  emergencyContact: { name: String, relationship: String, phone: String },
  bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'], default: 'unknown' },
  allergies: [{ substance: { type: String, trim: true }, reaction: { type: String, trim: true }, severity: { type: String, enum: ['mild', 'moderate', 'severe', 'unknown'], default: 'unknown' } }],
  consent: { treatment: { type: Boolean, default: false }, communications: { type: Boolean, default: false }, consentedAt: Date },
  active: { type: Boolean, default: true },
}, { timestamps: true, versionKey: 'version' });
patientSchema.index({ branch: 1, identifier: 1 }, { unique: true });
patientSchema.index({ branch: 1, 'contact.phone': 1 });
patientSchema.index({ name: 'text', identifier: 'text', 'contact.phone': 'text' });
module.exports = mongoose.model('Patient', patientSchema);
