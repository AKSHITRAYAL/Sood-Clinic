const DoctorProfile = require('../models/DoctorProfile');
const Department = require('../models/Department');
const Appointment = require('../models/Appointment');
const Branch = require('../models/Branch');
const { AppError } = require('../utils/http');

async function getBookableDepartments(branchId) {
  const departmentIds = await DoctorProfile.distinct('departments', { branch: branchId, active: true, bookingEnabled: true });
  return Department.find({ _id: { $in: departmentIds }, branch: branchId, active: true, publicBookingEnabled: true }).sort({ sortOrder: 1, name: 1 });
}

async function getBookableDoctors(branchId, departmentId) {
  return DoctorProfile.find({ branch: branchId, departments: departmentId, active: true, bookingEnabled: true })
    .populate({ path: 'user', select: 'name' })
    .select('user qualification weeklySchedule departments');
}

async function validateBooking({ branchId, departmentId, doctorId, startsAt, endsAt }) {
  const doctor = await DoctorProfile.findOne({ _id: doctorId, branch: branchId, departments: departmentId, active: true, bookingEnabled: true });
  if (!doctor) throw new AppError(422, 'The selected doctor is not available for this department.');
  const start = new Date(startsAt); const end = new Date(endsAt);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || end <= start || start <= new Date()) throw new AppError(422, 'A future appointment time with a valid end time is required.');
  const branch = await Branch.findById(branchId).select('timezone');
  if (!branch) throw new AppError(422, 'The selected branch is unavailable.');
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: branch.timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(start);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.find((part) => part.type === 'weekday')?.value);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value); const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  const startMinutes = hour * 60 + minute; const durationMinutes = (end - start) / 60000;
  const schedules = doctor.weeklySchedule.filter((rule) => rule.weekday === weekday);
  if (!schedules.length) throw new AppError(422, 'The doctor does not accept appointments on the selected day.');
  const schedule = schedules.find((rule) => {
    const [scheduleStartHour, scheduleStartMinute] = rule.startTime.split(':').map(Number);
    const [scheduleEndHour, scheduleEndMinute] = rule.endTime.split(':').map(Number);
    const scheduleStart = scheduleStartHour * 60 + scheduleStartMinute;
    const scheduleEnd = scheduleEndHour * 60 + scheduleEndMinute;
    return durationMinutes === rule.slotMinutes && startMinutes >= scheduleStart && startMinutes + durationMinutes <= scheduleEnd && (startMinutes - scheduleStart) % rule.slotMinutes === 0;
  });
  if (!schedule) throw new AppError(422, 'The selected time is outside the doctor’s published appointment slots.');
  const onLeave = doctor.leavePeriods.some((leave) => leave.startAt <= start && leave.endAt >= end);
  if (onLeave) throw new AppError(422, 'The doctor is unavailable during that time.');
  const conflict = await Appointment.exists({ doctor: doctorId, status: { $in: ['booked', 'checked_in', 'triage', 'in_consultation'] }, startsAt: { $lt: end }, endsAt: { $gt: start } });
  if (conflict) throw new AppError(409, 'This appointment time is no longer available.');
  return doctor;
}

module.exports = { getBookableDepartments, getBookableDoctors, validateBooking };
