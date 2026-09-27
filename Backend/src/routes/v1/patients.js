const router = require('express').Router();
const crypto = require('crypto');
const Patient = require('../../models/Patient');
const { requireAuth, permit } = require('../../middleware/auth');
const { assertBranchAccess } = require('../../middleware/branch');
const { asyncHandler, AppError, requireFields } = require('../../utils/http');
const { audit } = require('../../utils/audit');

router.get('/branches/:branchId/patients', requireAuth, permit('admin', 'receptionist', 'doctor', 'nurse'), asyncHandler(async (req, res) => {
  assertBranchAccess(req.user, req.params.branchId);
  const search = String(req.query.search || '').trim();
  const filter = { branch: req.params.branchId, active: true };
  if (search) filter.$text = { $search: search };
  res.json({ data: await Patient.find(filter).sort({ updatedAt: -1 }).limit(Math.min(Number(req.query.limit) || 50, 100)) });
}));

router.post('/branches/:branchId/patients', requireAuth, permit('admin', 'receptionist'), asyncHandler(async (req, res) => {
  assertBranchAccess(req.user, req.params.branchId);
  requireFields(req.body, ['name', 'phone']);
  const patient = await Patient.create({ ...req.body, branch: req.params.branchId, identifier: `PAT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, contact: { phone: req.body.phone, email: req.body.email } });
  await audit({ actor: req.user._id, action: 'patient.create', entityType: 'Patient', entityId: patient._id, branch: patient.branch });
  res.status(201).json({ data: patient });
}));

router.get('/patients/:patientId', requireAuth, asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.patientId);
  if (!patient) throw new AppError(404, 'Patient not found.');
  if (req.user.role === 'patient' && String(patient.portalUser) !== String(req.user._id)) throw new AppError(403, 'You may only access your own record.');
  if (req.user.role !== 'patient') assertBranchAccess(req.user, patient.branch);
  res.json({ data: patient });
}));
module.exports = router;
