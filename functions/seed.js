const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function seed() {
  const branch = db.collection('branches').doc('sood-clinic');
  const department = db.collection('departments').doc('gastroenterology');
  const doctor = db.collection('doctors').doc('brig-ak-sood');
  const batch = db.batch();
  batch.set(branch, { name: 'Sood Clinic', code: 'SOOD', timezone: 'Asia/Kolkata', active: true, address: { line1: 'House No. 398, Sector 10', city: 'Panchkula', state: 'Haryana', postalCode: '134109', country: 'IN' }, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  batch.set(department, { branchId: branch.id, name: 'Gastroenterology', code: 'GASTRO', description: 'Digestive health and gastroenterology consultations.', active: true, publicBookingEnabled: true, sortOrder: 1, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  batch.set(doctor, { branchId: branch.id, departmentIds: [department.id], name: 'Dr. Brig. A. K. Sood VSM (Retd)', qualification: 'MBBS, MD, DNB, DM', registrationNumber: 'HR886', active: true, bookingEnabled: true, weeklySchedule: [1, 2, 3, 4, 5, 6].flatMap((weekday) => [{ weekday, startTime: '08:00', endTime: '10:00', slotMinutes: 20 }, { weekday, startTime: '17:00', endTime: '18:30', slotMinutes: 20 }]), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
  console.log('Sood Clinic Firestore catalog seeded.');
}
seed().catch((error) => { console.error(error); process.exit(1); });
