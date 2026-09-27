const mongoose = require('mongoose');

const auditEventSchema = new mongoose.Schema({
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  action: { type: String, required: true, trim: true, maxlength: 120, index: true },
  entityType: { type: String, required: true, trim: true, maxlength: 80 },
  entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  branch: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, versionKey: false });
auditEventSchema.index({ createdAt: -1 });
module.exports = mongoose.model('AuditEvent', auditEventSchema);
