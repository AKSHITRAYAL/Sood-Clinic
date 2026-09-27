const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User = require('../../models/User');
const DoctorProfile = require('../../models/DoctorProfile');
const Department = require('../../models/Department');
const { requireAuth, permit } = require('../../middleware/auth');
const { assertBranchAccess } = require('../../middleware/branch');
const { asyncHandler, AppError, requireFields } = require('../../utils/http');
const { audit } = require('../../utils/audit');

async function validateDoctorDepartments(branchId, departmentIds) {
  if (!Array.isArray(departmentIds) || !departmentIds.length) throw new AppError(422, 'At least one department is required for a doctor.');
  const count = await Department.countDocuments({ _id: { $in: departmentIds }, branch: branchId, active: true });
  if (count !== departmentIds.length) throw new AppError(422, 'Every selected department must be active and belong to the doctor branch.');
}

router.post('/doctors', requireAuth, permit('admin'), asyncHandler(async (req, res) => {
  requireFields(req.body, ['name', 'email', 'password', 'branchId', 'departmentIds']);
  assertBranchAccess(req.user, req.body.branchId);
  await validateDoctorDepartments(req.body.branchId, req.body.departmentIds);
  if (await User.exists({ email: String(req.body.email).trim().toLowerCase() })) throw new AppError(409, 'An account already exists for this email address.');
  const user = await User.create({ name: req.body.name, email: req.body.email, phone: req.body.phone, role: 'doctor', branches: [req.body.branchId], passwordHash: await bcrypt.hash(req.body.password, 12) });
  try {
    const doctor = await DoctorProfile.create({ user: user._id, branch: req.body.branchId, departments: req.body.departmentIds, registrationNumber: req.body.registrationNumber, qualification: req.body.qualification, weeklySchedule: req.body.weeklySchedule || [] });
    await audit({ actor: req.user._id, action: 'doctor.create', entityType: 'DoctorProfile', entityId: doctor._id, branch: doctor.branch });
    return res.status(201).json({ data: { id: doctor._id, user: { id: user._id, name: user.name, email: user.email }, branch: doctor.branch, departments: doctor.departments } });
  } catch (error) { await User.findByIdAndDelete(user._id); throw error; }
}));

router.get('/branches/:branchId/doctors', requireAuth, asyncHandler(async (req, res) => {
  assertBranchAccess(req.user, req.params.branchId);
  const filter = { branch: req.params.branchId };
  if (req.query.departmentId) filter.departments = req.query.departmentId;
  const data = await DoctorProfile.find(filter).populate('user', 'name email phone active').populate('departments', 'name code active').sort({ createdAt: -1 });
  res.json({ data });
}));

router.patch('/doctors/:doctorId', requireAuth, permit('admin'), asyncHandler(async (req, res) => {
  const doctor = await DoctorProfile.findById(req.params.doctorId);
  if (!doctor) throw new AppError(404, 'Doctor not found.');
  assertBranchAccess(req.user, doctor.branch);
  if (req.body.departmentIds !== undefined) { await validateDoctorDepartments(doctor.branch, req.body.departmentIds); doctor.departments = req.body.departmentIds; }
  ['registrationNumber', 'qualification', 'bookingEnabled', 'active', 'weeklySchedule', 'leavePeriods'].forEach((field) => { if (req.body[field] !== undefined) doctor[field] = req.body[field]; });
  await doctor.save();
  await audit({ actor: req.user._id, action: 'doctor.update', entityType: 'DoctorProfile', entityId: doctor._id, branch: doctor.branch });
  res.json({ data: doctor });
}));
module.exports = router;
