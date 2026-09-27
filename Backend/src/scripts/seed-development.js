const bcrypt = require('bcryptjs');
const { connectDatabase } = require('../config/database');
const Branch = require('../models/Branch');
const Department = require('../models/Department');
const User = require('../models/User');
const DoctorProfile = require('../models/DoctorProfile');

async function seed() {
  await connectDatabase();
  const branch = await Branch.findOneAndUpdate({ code: 'MAIN' }, { name: 'Northstar Family Clinic', code: 'MAIN', timezone: 'Asia/Kolkata', active: true }, { new: true, upsert: true, setDefaultsOnInsert: true });
  const department = await Department.findOneAndUpdate({ branch: branch._id, code: 'GENERAL-MEDICINE' }, { branch: branch._id, name: 'General Medicine', code: 'GENERAL-MEDICINE', active: true, publicBookingEnabled: true, sortOrder: 1 }, { new: true, upsert: true, setDefaultsOnInsert: true });
  let admin = await User.findOne({ email: 'admin@careflow.local' }).select('+passwordHash');
  if (!admin) admin = await User.create({ name: 'Clinic Administrator', email: 'admin@careflow.local', passwordHash: await bcrypt.hash('ChangeMe#2026', 12), role: 'admin', branches: [branch._id] });
  let doctorUser = await User.findOne({ email: 'doctor@careflow.local' });
  if (!doctorUser) doctorUser = await User.create({ name: 'Dr. Asha Verma', email: 'doctor@careflow.local', passwordHash: await bcrypt.hash('ChangeMe#2026', 12), role: 'doctor', branches: [branch._id] });
  await DoctorProfile.findOneAndUpdate({ user: doctorUser._id }, { user: doctorUser._id, branch: branch._id, departments: [department._id], qualification: 'MBBS, MD (General Medicine)', bookingEnabled: true, active: true, weeklySchedule: [{ weekday: 1, startTime: '09:00', endTime: '17:00', slotMinutes: 20 }, { weekday: 2, startTime: '09:00', endTime: '17:00', slotMinutes: 20 }, { weekday: 3, startTime: '09:00', endTime: '17:00', slotMinutes: 20 }, { weekday: 4, startTime: '09:00', endTime: '17:00', slotMinutes: 20 }, { weekday: 5, startTime: '09:00', endTime: '17:00', slotMinutes: 20 }] }, { new: true, upsert: true, setDefaultsOnInsert: true });
  console.log(`Seeded ${branch.name}: ${department.name} is the only public booking department.`);
  await require('mongoose').connection.close();
}
seed().catch((error) => { console.error(error); process.exit(1); });
