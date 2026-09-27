const router = require('express').Router();
const Appointment = require('../../models/Appointment');
const Encounter = require('../../models/Encounter');
const DoctorProfile = require('../../models/DoctorProfile');
const { requireAuth, permit } = require('../../middleware/auth');
const { assertBranchAccess } = require('../../middleware/branch');
const { asyncHandler, AppError, requireFields } = require('../../utils/http');
const { audit } = require('../../utils/audit');

router.post('/appointments/:appointmentId/encounter', requireAuth, permit('doctor'), asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.appointmentId);
  if (!appointment) throw new AppError(404, 'Appointment not found.');
  const doctor = await DoctorProfile.findOne({ user: req.user._id, active: true });
  if (!doctor || String(appointment.doctor) !== String(doctor._id)) throw new AppError(403, 'Doctors may create encounters only for their own appointments.');
  requireFields(req.body, ['clinicalNotes']);
  const encounter = await Encounter.findOneAndUpdate(
    { appointment: appointment._id },
    { $set: { branch: appointment.branch, appointment: appointment._id, patient: appointment.patient, doctor: doctor._id, chiefComplaint: req.body.chiefComplaint, clinicalNotes: req.body.clinicalNotes, diagnoses: req.body.diagnoses || [], prescriptions: req.body.prescriptions || [], status: req.body.sign ? 'signed' : 'draft', ...(req.body.sign ? { signedAt: new Date(), signedBy: req.user._id } : {}) } },
    { new: true, upsert: true, runValidators: true }
  );
  if (req.body.sign) { appointment.status = 'completed'; await appointment.save(); }
  await audit({ actor: req.user._id, action: req.body.sign ? 'encounter.sign' : 'encounter.save_draft', entityType: 'Encounter', entityId: encounter._id, branch: appointment.branch });
  res.status(201).json({ data: encounter });
}));

router.patch('/appointments/:appointmentId/vitals', requireAuth, permit('doctor', 'nurse'), asyncHandler(async (req, res) => {
  const appointment = await Appointment.findById(req.params.appointmentId);
  if (!appointment) throw new AppError(404, 'Appointment not found.');
  assertBranchAccess(req.user, appointment.branch);
  const encounter = await Encounter.findOneAndUpdate({ appointment: appointment._id }, { $set: { branch: appointment.branch, appointment: appointment._id, patient: appointment.patient, doctor: appointment.doctor, 'vitals.bloodPressure': req.body.bloodPressure, 'vitals.temperatureC': req.body.temperatureC, 'vitals.pulse': req.body.pulse, 'vitals.weightKg': req.body.weightKg, 'vitals.heightCm': req.body.heightCm, 'vitals.recordedBy': req.user._id, 'vitals.recordedAt': new Date() } }, { new: true, upsert: true, runValidators: true });
  if (appointment.status === 'checked_in') { appointment.status = 'triage'; await appointment.save(); }
  await audit({ actor: req.user._id, action: 'encounter.record_vitals', entityType: 'Encounter', entityId: encounter._id, branch: appointment.branch });
  res.json({ data: encounter });
}));
module.exports = router;
