const router = require('express').Router();
const crypto = require('crypto');
const Patient = require('../../models/Patient');
const Appointment = require('../../models/Appointment');
const Branch = require('../../models/Branch');
const { getBookableDepartments, getBookableDoctors, validateBooking } = require('../../services/availability');
const { asyncHandler, AppError, requireFields } = require('../../utils/http');
const { audit } = require('../../utils/audit');

router.get('/branches', asyncHandler(async (req, res) => res.json({ data: await Branch.find({ active: true }).select('name code timezone').sort({ name: 1 }) })));
router.get('/branches/:branchId/departments', asyncHandler(async (req, res) => res.json({ data: await getBookableDepartments(req.params.branchId) })));
router.get('/branches/:branchId/departments/:departmentId/doctors', asyncHandler(async (req, res) => {
  const doctors = await getBookableDoctors(req.params.branchId, req.params.departmentId);
  res.json({ data: doctors.map((doctor) => ({ id: doctor._id, name: doctor.user?.name, qualification: doctor.qualification, schedule: doctor.weeklySchedule })) });
}));
router.post('/appointments', asyncHandler(async (req, res) => {
  requireFields(req.body, ['branchId', 'departmentId', 'doctorId', 'startsAt', 'endsAt', 'patient']);
  requireFields(req.body.patient, ['name', 'phone']);
  if (!req.body.patient.consentToTreatment) throw new AppError(422, 'Consent to treatment is required to book an appointment.');
  await validateBooking({ branchId: req.body.branchId, departmentId: req.body.departmentId, doctorId: req.body.doctorId, startsAt: req.body.startsAt, endsAt: req.body.endsAt });
  let patient = await Patient.findOne({ branch: req.body.branchId, 'contact.phone': req.body.patient.phone, active: true });
  if (!patient) patient = await Patient.create({ identifier: `PAT-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, branch: req.body.branchId, name: req.body.patient.name, dateOfBirth: req.body.patient.dateOfBirth, gender: req.body.patient.gender || 'unknown', contact: { phone: req.body.patient.phone, email: req.body.patient.email }, consent: { treatment: true, communications: Boolean(req.body.patient.consentToCommunications), consentedAt: new Date() } });
  const appointment = await Appointment.create({ branch: req.body.branchId, patient: patient._id, department: req.body.departmentId, doctor: req.body.doctorId, startsAt: req.body.startsAt, endsAt: req.body.endsAt, reason: req.body.reason, source: 'patient_portal' });
  await audit({ action: 'appointment.public_create', entityType: 'Appointment', entityId: appointment._id, branch: appointment.branch, metadata: { patient: patient.identifier } });
  res.status(201).json({ data: { appointmentId: appointment._id, reference: patient.identifier, status: appointment.status } });
}));
module.exports = router;
