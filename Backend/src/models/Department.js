const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  code: { type: String, required: true, trim: true, uppercase: true, match: /^[A-Z0-9_-]{2,30}$/ },
  description: { type: String, trim: true, maxlength: 1000 },
  active: { type: Boolean, default: true },
  publicBookingEnabled: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true, versionKey: 'version' });
departmentSchema.index({ branch: 1, code: 1 }, { unique: true });
departmentSchema.index({ branch: 1, active: 1, publicBookingEnabled: 1, sortOrder: 1 });
module.exports = mongoose.model('Department', departmentSchema);
