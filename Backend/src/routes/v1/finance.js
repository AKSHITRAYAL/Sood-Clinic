const router = require('express').Router();
const Invoice = require('../../models/Invoice');
const Payment = require('../../models/Payment');
const { requireAuth, permit } = require('../../middleware/auth');
const { assertBranchAccess } = require('../../middleware/branch');
const { asyncHandler, AppError, requireFields } = require('../../utils/http');
const { audit } = require('../../utils/audit');

router.post('/branches/:branchId/invoices', requireAuth, permit('admin', 'receptionist', 'billing'), asyncHandler(async (req, res) => {
  assertBranchAccess(req.user, req.params.branchId);
  requireFields(req.body, ['number', 'patientId', 'items']);
  const items = req.body.items;
  if (!Array.isArray(items) || !items.length) throw new AppError(422, 'At least one invoice item is required.');
  const subtotal = items.reduce((sum, item) => sum + Number(item.quantity || 1) * Number(item.unitAmount || 0), 0);
  const taxTotal = items.reduce((sum, item) => sum + Number(item.quantity || 1) * Number(item.unitAmount || 0) * (Number(item.taxRate || 0) / 100), 0);
  const invoice = await Invoice.create({ number: req.body.number, branch: req.params.branchId, patient: req.body.patientId, appointment: req.body.appointmentId, items, subtotal, taxTotal, total: subtotal + taxTotal, status: 'issued', issuedAt: new Date(), dueAt: req.body.dueAt, createdBy: req.user._id });
  await audit({ actor: req.user._id, action: 'invoice.create', entityType: 'Invoice', entityId: invoice._id, branch: invoice.branch });
  res.status(201).json({ data: invoice });
}));

router.post('/invoices/:invoiceId/payments', requireAuth, permit('admin', 'receptionist', 'billing'), asyncHandler(async (req, res) => {
  requireFields(req.body, ['amount', 'method']);
  const invoice = await Invoice.findById(req.params.invoiceId);
  if (!invoice) throw new AppError(404, 'Invoice not found.');
  assertBranchAccess(req.user, invoice.branch);
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || invoice.amountPaid + amount > invoice.total) throw new AppError(422, 'Payment amount must be greater than zero and cannot exceed the balance.');
  const payment = await Payment.create({ invoice: invoice._id, branch: invoice.branch, amount, method: req.body.method, externalReference: req.body.externalReference, receivedBy: req.user._id });
  invoice.amountPaid += amount;
  invoice.status = invoice.amountPaid === invoice.total ? 'paid' : 'partially_paid';
  await invoice.save();
  await audit({ actor: req.user._id, action: 'payment.capture', entityType: 'Payment', entityId: payment._id, branch: invoice.branch });
  res.status(201).json({ data: payment, invoice });
}));
module.exports = router;
