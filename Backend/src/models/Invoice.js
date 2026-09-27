const mongoose = require('mongoose');

const lineItemSchema = new mongoose.Schema({ description: { type: String, required: true }, quantity: { type: Number, required: true, min: 1, default: 1 }, unitAmount: { type: Number, required: true, min: 0 }, taxRate: { type: Number, default: 0, min: 0, max: 100 } }, { _id: false });
const invoiceSchema = new mongoose.Schema({
  number: { type: String, required: true, trim: true, uppercase: true },
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true, index: true },
  appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment' },
  items: { type: [lineItemSchema], validate: [(items) => items.length > 0, 'Invoice requires at least one line item'] },
  subtotal: { type: Number, required: true, min: 0 },
  taxTotal: { type: Number, required: true, min: 0, default: 0 },
  total: { type: Number, required: true, min: 0 },
  amountPaid: { type: Number, required: true, min: 0, default: 0 },
  status: { type: String, enum: ['draft', 'issued', 'partially_paid', 'paid', 'void', 'refunded'], default: 'draft', index: true },
  issuedAt: Date,
  dueAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true, versionKey: 'version' });
invoiceSchema.index({ branch: 1, number: 1 }, { unique: true });
invoiceSchema.index({ patient: 1, createdAt: -1 });
module.exports = mongoose.model('Invoice', invoiceSchema);
