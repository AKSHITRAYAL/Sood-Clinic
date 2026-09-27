const mongoose = require('mongoose');

const weeklyScheduleSchema = new mongoose.Schema({
  weekday: { type: Number, required: true, min: 0, max: 6 },
  startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  slotMinutes: { type: Number, required: true, min: 5, max: 240, default: 20 },
}, { _id: false });

const doctorProfileSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  registrationNumber: { type: String, trim: true, uppercase: true, unique: true, sparse: true },
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
  departments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true }],
  qualification: { type: String, trim: true, maxlength: 250 },
  bookingEnabled: { type: Boolean, default: true },
  active: { type: Boolean, default: true },
  weeklySchedule: { type: [weeklyScheduleSchema], default: [] },
  leavePeriods: [{ startAt: Date, endAt: Date, reason: { type: String, maxlength: 250 } }],
}, { timestamps: true, versionKey: 'version' });
doctorProfileSchema.index({ branch: 1, departments: 1, active: 1, bookingEnabled: 1 });
module.exports = mongoose.model('DoctorProfile', doctorProfileSchema);
