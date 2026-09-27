const bcrypt = require('bcryptjs');
const { connectDatabase } = require('../config/database');
const Branch = require('../models/Branch');
const Department = require('../models/Department');
const User = require('../models/User');
const DoctorProfile = require('../models/DoctorProfile');

async function seed() {
  await connectDatabase();
  const branch = await Branch.findOneAndUpdate({ code: 'MAIN' }, { name: 'Sood Clinic', code: 'MAIN', address: { line1: 'House No. 398, Sector 10', city: 'Panchkula', state: 'Haryana', postalCode: '134109', country: 'IN' }, timezone: 'Asia/Kolkata', active: true }, { new: true, upsert: true, setDefaultsOnInsert: true });
  await Department.updateMany({ branch: branch._id, code: { $ne: 'GASTROENTEROLOGY' } }, { $set: { publicBookingEnabled: false } });
  const department = await Department.findOneAndUpdate({ branch: branch._id, code: 'GASTROENTEROLOGY' }, { branch: branch._id, name: 'Gastroenterology', code: 'GASTROENTEROLOGY', description: 'Gastroenterology consultations with Dr. Brig. A. K. Sood VSM (Retd).', active: true, publicBookingEnabled: true, sortOrder: 1 }, { new: true, upsert: true, setDefaultsOnInsert: true });
  let admin = await User.findOne({ email: 'admin@careflow.local' }).select('+passwordHash');
  if (!admin) admin = await User.create({ name: 'Sood Clinic Administrator', email: 'admin@careflow.local', passwordHash: await bcrypt.hash('ChangeMe#2026', 12), role: 'admin', branches: [branch._id] });
  let doctorUser = await User.findOne({ email: 'doctor@careflow.local' });
  if (!doctorUser) doctorUser = await User.create({ name: 'Dr. Brig. A. K. Sood VSM (Retd)', email: 'doctor@careflow.local', passwordHash: await bcrypt.hash('ChangeMe#2026', 12), role: 'doctor', branches: [branch._id] });
  else doctorUser = await User.findByIdAndUpdate(doctorUser._id, { name: 'Dr. Brig. A. K. Sood VSM (Retd)', branches: [branch._id], active: true }, { new: true });
  const weeklySchedule = [1, 2, 3, 4, 5, 6].flatMap((weekday) => [{ weekday, startTime: '08:00', endTime: '10:00', slotMinutes: 15 }, { weekday, startTime: '17:00', endTime: '18:30', slotMinutes: 15 }]);
  await DoctorProfile.findOneAndUpdate({ user: doctorUser._id }, { user: doctorUser._id, registrationNumber: 'HR886', branch: branch._id, departments: [department._id], qualification: 'MBBS, MD, DNB, DM · Gastroenterology', bookingEnabled: true, active: true, weeklySchedule }, { new: true, upsert: true, setDefaultsOnInsert: true });
  console.log(`Seeded ${branch.name} with ${doctorUser.name} for Gastroenterology appointments.`);
  await require('mongoose').connection.close();
}
seed().catch((error) => { console.error(error); process.exit(1); });
