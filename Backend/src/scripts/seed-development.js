const bcrypt = require('bcryptjs');
const { connectDatabase } = require('../config/database');
const Branch = require('../models/Branch');
const Department = require('../models/Department');
const User = require('../models/User');
const DoctorProfile = require('../models/DoctorProfile');

async function seed() {
  await connectDatabase();
  const branch = await Branch.findOneAndUpdate({ code: 'MAIN' }, { name: 'Sood Clinic', code: 'MAIN', timezone: 'Asia/Kolkata', active: true }, { new: true, upsert: true, setDefaultsOnInsert: true });
  const department = await Department.findOneAndUpdate({ branch: branch._id, code: 'GENERAL-CONSULTATION' }, { branch: branch._id, name: 'General Consultation', code: 'GENERAL-CONSULTATION', active: true, publicBookingEnabled: false, sortOrder: 1 }, { new: true, upsert: true, setDefaultsOnInsert: true });
  let admin = await User.findOne({ email: 'admin@careflow.local' }).select('+passwordHash');
  if (!admin) admin = await User.create({ name: 'Sood Clinic Administrator', email: 'admin@careflow.local', passwordHash: await bcrypt.hash('ChangeMe#2026', 12), role: 'admin', branches: [branch._id] });
  let doctorUser = await User.findOne({ email: 'doctor@careflow.local' });
  if (!doctorUser) doctorUser = await User.create({ name: 'Brig. A. K. Sood', email: 'doctor@careflow.local', passwordHash: await bcrypt.hash('ChangeMe#2026', 12), role: 'doctor', branches: [branch._id] });
  else doctorUser = await User.findByIdAndUpdate(doctorUser._id, { name: 'Brig. A. K. Sood', branches: [branch._id], active: true }, { new: true });
  await DoctorProfile.findOneAndUpdate({ user: doctorUser._id }, { user: doctorUser._id, branch: branch._id, departments: [department._id], qualification: 'Clinic Owner & Lead Physician', bookingEnabled: false, active: true, weeklySchedule: [] }, { new: true, upsert: true, setDefaultsOnInsert: true });
  console.log(`Seeded ${branch.name} with ${doctorUser.name}. Public booking remains disabled until the clinic confirms working hours.`);
  await require('mongoose').connection.close();
}
seed().catch((error) => { console.error(error); process.exit(1); });
