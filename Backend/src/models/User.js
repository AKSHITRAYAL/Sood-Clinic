const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, match: /^\S+@\S+\.\S+$/ },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, required: true, enum: ['admin', 'receptionist', 'doctor', 'nurse', 'billing', 'patient'] },
  phone: { type: String, trim: true },
  branches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }],
  active: { type: Boolean, default: true },
  lastLoginAt: { type: Date },
  passwordChangedAt: { type: Date },
}, { timestamps: true, versionKey: 'version' });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1, active: 1 });
module.exports = mongoose.model('User', userSchema);
