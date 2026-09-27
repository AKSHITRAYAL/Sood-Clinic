const router = require('express').Router();
const Branch = require('../../models/Branch');
const Department = require('../../models/Department');
const { requireAuth, permit } = require('../../middleware/auth');
const { assertBranchAccess } = require('../../middleware/branch');
const { asyncHandler, AppError, requireFields } = require('../../utils/http');
const { audit } = require('../../utils/audit');

router.get('/branches', requireAuth, asyncHandler(async (req, res) => {
  const filter = req.user.role === 'admin' ? { active: true } : { _id: { $in: req.user.branches }, active: true };
  res.json({ data: await Branch.find(filter).sort({ name: 1 }) });
}));
router.post('/branches', requireAuth, permit('admin'), asyncHandler(async (req, res) => {
  requireFields(req.body, ['name', 'code']);
  const branch = await Branch.create(req.body);
  await audit({ actor: req.user._id, action: 'branch.create', entityType: 'Branch', entityId: branch._id, branch: branch._id });
  res.status(201).json({ data: branch });
}));
router.get('/branches/:branchId/departments', requireAuth, asyncHandler(async (req, res) => {
  assertBranchAccess(req.user, req.params.branchId);
  res.json({ data: await Department.find({ branch: req.params.branchId }).sort({ sortOrder: 1, name: 1 }) });
}));
router.post('/branches/:branchId/departments', requireAuth, permit('admin'), asyncHandler(async (req, res) => {
  assertBranchAccess(req.user, req.params.branchId);
  requireFields(req.body, ['name', 'code']);
  const department = await Department.create({ ...req.body, branch: req.params.branchId });
  await audit({ actor: req.user._id, action: 'department.create', entityType: 'Department', entityId: department._id, branch: department.branch });
  res.status(201).json({ data: department });
}));
router.patch('/departments/:departmentId', requireAuth, permit('admin'), asyncHandler(async (req, res) => {
  const department = await Department.findById(req.params.departmentId);
  if (!department) throw new AppError(404, 'Department not found.');
  assertBranchAccess(req.user, department.branch);
  const allowed = ['name', 'code', 'description', 'active', 'publicBookingEnabled', 'sortOrder'];
  allowed.forEach((key) => { if (req.body[key] !== undefined) department[key] = req.body[key]; });
  await department.save();
  await audit({ actor: req.user._id, action: 'department.update', entityType: 'Department', entityId: department._id, branch: department.branch });
  res.json({ data: department });
}));
module.exports = router;
