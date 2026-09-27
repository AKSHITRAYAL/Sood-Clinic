const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  code: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z0-9_-]{2,20}$/ },
  phone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  address: { line1: String, line2: String, city: String, state: String, postalCode: String, country: { type: String, default: 'IN' } },
  timezone: { type: String, default: 'Asia/Kolkata' },
  active: { type: Boolean, default: true },
}, { timestamps: true, versionKey: 'version' });
branchSchema.index({ code: 1 }, { unique: true });
module.exports = mongoose.model('Branch', branchSchema);
