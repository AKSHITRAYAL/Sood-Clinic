const router = require('express').Router();
const Appointment = require('../../models/Appointment');
const DoctorProfile = require('../../models/DoctorProfile');
const { requireAuth, permit } = require('../../middleware/auth');
const { assertBranchAccess } = require('../../middleware/branch');
const { validateBooking } = require('../../services/availability');
const { asyncHandler, AppError, requireFields } = require('../../utils/http');
const { audit } = require('../../utils/audit');

const transitions = {
  booked: ['checked_in', 'cancelled', 'no_show'], checked_in: ['triage', 'in_consultation', 'cancelled'],
  triage: ['in_consultation', 'cancelled'], in_consultation: ['completed'], completed: [], cancelled: [], no_show: [],
};

async function doctorForUser(userId) { return DoctorProfile.findOne({ user: userId, active: true }); }

router.get('/branches/:branchId/appointments', requireAuth, permit('admin', 'receptionist', 'doctor', 'nurse', 'billing'), asyncHandler(async (req, res) => {
  assertBranchAccess(req.user, req.params.branchId);
  const filter = { branch: req.params.branchId };
  if (req.query.from || req.query.to) filter.startsAt = { ...(req.query.from ? { $gte: new Date(req.query.from) } : {}), ...(req.query.to ? { $lt: new Date(req.query.to) } : {}) };
  if (req.user.role === 'doctor') { const doctor = await doctorForUser(req.user._id); filter.doctor = doctor?._id || null; }
  const data = await Appointment.find(filter).populate('patient', 'identifier name contact allergies').populate({ path: 'doctor', populate: { path: 'user', select: 'name' } }).populate('department', 'name code').sort({ startsAt: 1 });
  res.json({ data });
}));

router.post('/branches/:branchId/appointments', requireAuth, permit('admin', 'receptionist'), asyncHandler(async (req, res) => {
  assertBranchAccess(req.user, req.params.branchId);
  requireFields(req.body, ['patientId', 'departmentId', 'doctorId', 'startsAt', 'endsAt']);
  await validateBooking({ branchId: req.params.branchId, departmentId: req.body.departmentId, doctorId: req.body.doctorId, startsAt: req.body.startsAt, endsAt: req.body.endsAt });
  const appointment = await Appointment.create({ branch: req.params.branchId, patient: req.body.patientId, department: req.body.departmentId, doctor: req.body.doctorId, startsAt: req.body.startsAt, endsAt: req.body.endsAt, reason: req.body.reason, source: req.body.source || 'reception', createdBy: req.user._id });
  await audit({ actor: req.user._id, action: 'appointment.create', entityType: 'Appointment', entityId: appointment._id, branch: appointment.branch });
  res.status(201).json({ data: appointment });
}));

router.patch('/appointments/:appointmentId/status', requireAuth, permit('admin', 'receptionist', 'doctor', 'nurse'), asyncHandler(async (req, res) => {
  requireFields(req.body, ['status']);
  const appointment = await Appointment.findById(req.params.appointmentId);
  if (!appointment) throw new AppError(404, 'Appointment not found.');
  assertBranchAccess(req.user, appointment.branch);
  if (req.user.role === 'doctor') { const doctor = await doctorForUser(req.user._id); if (!doctor || String(appointment.doctor) !== String(doctor._id)) throw new AppError(403, 'Doctors may update only their own appointments.'); }
  if (!transitions[appointment.status].includes(req.body.status)) throw new AppError(422, `Cannot change appointment status from ${appointment.status} to ${req.body.status}.`);
  appointment.status = req.body.status;
  if (req.body.status === 'checked_in') appointment.checkInAt = new Date();
  if (req.body.status === 'cancelled') { appointment.cancelledAt = new Date(); appointment.cancellationReason = req.body.reason || undefined; }
  await appointment.save();
  await audit({ actor: req.user._id, action: `appointment.${req.body.status}`, entityType: 'Appointment', entityId: appointment._id, branch: appointment.branch });
  res.json({ data: appointment });
}));
module.exports = router;
