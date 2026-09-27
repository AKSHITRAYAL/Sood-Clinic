const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true, index: true },
  doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'DoctorProfile', required: true, index: true },
  startsAt: { type: Date, required: true, index: true },
  endsAt: { type: Date, required: true },
  status: { type: String, enum: ['booked', 'checked_in', 'triage', 'in_consultation', 'completed', 'cancelled', 'no_show'], default: 'booked', index: true },
  source: { type: String, enum: ['patient_portal', 'reception', 'phone', 'walk_in', 'admin'], default: 'patient_portal' },
  reason: { type: String, trim: true, maxlength: 1000 },
  queueToken: { type: Number, min: 1 },
  checkInAt: Date,
  cancelledAt: Date,
  cancellationReason: { type: String, maxlength: 500 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, versionKey: 'version' });
appointmentSchema.index({ doctor: 1, startsAt: 1 }, { unique: true, partialFilterExpression: { status: { $in: ['booked', 'checked_in', 'triage', 'in_consultation'] } } });
appointmentSchema.index({ branch: 1, startsAt: 1, status: 1 });
appointmentSchema.index({ patient: 1, startsAt: -1 });
module.exports = mongoose.model('Appointment', appointmentSchema);
