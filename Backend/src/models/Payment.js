const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true, index: true },
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
  amount: { type: Number, required: true, min: 0.01 },
  method: { type: String, enum: ['cash', 'card', 'upi', 'bank_transfer', 'insurance', 'other'], required: true },
  externalReference: { type: String, trim: true, unique: true, sparse: true },
  status: { type: String, enum: ['captured', 'refunded', 'failed'], default: 'captured' },
  receivedAt: { type: Date, default: Date.now },
  receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, versionKey: 'version' });
module.exports = mongoose.model('Payment', paymentSchema);
