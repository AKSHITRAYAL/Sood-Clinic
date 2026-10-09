import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

const projectId = 'demo-sood-clinic';
let testEnv;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Firestore default-deny boundary', () => {
  it('allows anonymous reads of the intentionally public doctor catalog', async () => {
    const db = testEnv.unauthenticatedContext().firestore();

    await assertSucceeds(getDoc(doc(db, 'doctors', 'brig-ak-sood')));
  });

  it('denies anonymous reads from an unknown collection', async () => {
    const db = testEnv.unauthenticatedContext().firestore();

    await assertFails(getDoc(doc(db, 'privateSystem', 'anything')));
  });

  it('denies direct patient profile writes because a trusted callable keeps the private directory in sync', async () => {
    const db = testEnv.authenticatedContext('patient-one', { email: 'patient@example.com' }).firestore();
    const profile = doc(db, 'patients', 'patient-one');
    const record = {
      displayName: 'Patient One', email: 'patient@example.com', title: '', phone: '',
      dateOfBirth: '', gender: '', maritalStatus: '', bloodGroup: '', addressLine1: '',
      city: '', state: '', postalCode: '', emergencyContactName: '', emergencyContactPhone: '',
      allergies: '', currentMedications: '', healthNotes: '', createdAt: '2026-10-06T00:00:00.000Z',
      updatedAt: '2026-10-06T00:00:00.000Z',
    };

    await assertFails(setDoc(profile, record));
    await assertFails(updateDoc(profile, { phone: '9999999999', updatedAt: '2026-10-06T00:01:00.000Z' }));
    await assertFails(updateDoc(profile, { staffOnlyNote: 'not permitted' }));
  });

  it('does not let a patient author clinic medical documents', async () => {
    const db = testEnv.authenticatedContext('patient-one', { email: 'patient@example.com' }).firestore();
    await assertFails(setDoc(doc(db, 'patients', 'patient-one', 'medicalDocuments', 'record-one'), { title: 'Self upload' }));
  });

  it('keeps clinical history and documents out of receptionist/admin reads while allowing the owning patient and doctor', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'patients', 'patient-one', 'medicalHistory', 'entry-one'), { details: 'Clinical history' });
      await setDoc(doc(db, 'patients', 'patient-one', 'medicalDocuments', 'document-one'), { title: 'Clinic report' });
    });
    const patient = testEnv.authenticatedContext('patient-one', { email: 'patient@example.com' }).firestore();
    const doctor = testEnv.authenticatedContext('doctor-one', { role: 'doctor', doctorId: 'maharana' }).firestore();
    const reception = testEnv.authenticatedContext('reception-one', { role: 'receptionist' }).firestore();
    const admin = testEnv.authenticatedContext('admin-one', { role: 'admin' }).firestore();
    const history = doc(patient, 'patients', 'patient-one', 'medicalHistory', 'entry-one');
    const document = doc(patient, 'patients', 'patient-one', 'medicalDocuments', 'document-one');

    await assertSucceeds(getDoc(history));
    await assertSucceeds(getDoc(doc(doctor, 'patients', 'patient-one', 'medicalHistory', 'entry-one')));
    await assertFails(getDoc(doc(reception, 'patients', 'patient-one', 'medicalHistory', 'entry-one')));
    await assertFails(getDoc(doc(admin, 'patients', 'patient-one', 'medicalDocuments', 'document-one')));
    await assertFails(getDoc(doc(reception, 'patients', 'patient-one', 'medicalDocuments', 'document-one')));
    await assertSucceeds(setDoc(doc(reception, 'patients', 'patient-one', 'medicalDocuments', 'new-document'), { title: 'Uploaded by reception' }));
    await assertFails(setDoc(doc(reception, 'patients', 'patient-one', 'medicalHistory', 'new-history'), { details: 'Not allowed' }));
    await assertFails(setDoc(doc(admin, 'auditLogs', 'browser-log'), { action: 'not allowed' }));
  });

  it('denies every direct browser write to appointment records and slot locks', async () => {
    const db = testEnv.authenticatedContext('patient-one', { email: 'patient@example.com' }).firestore();
    await assertFails(setDoc(doc(db, 'appointments', 'browser-created'), {
      doctorId: 'brig-ak-sood', patientId: 'patient-one', status: 'scheduled',
    }));
    await assertFails(setDoc(doc(db, 'appointmentSlots', 'brig-ak-sood_202610090800'), {
      doctorId: 'brig-ak-sood', status: 'booked', appointmentId: 'browser-created',
    }));
  });

  it('never lets an administrator browser session write staff access records', async () => {
    const db = testEnv.authenticatedContext('admin-one', { role: 'admin', email: 'admin@example.com' }).firestore();
    await assertFails(setDoc(doc(db, 'staffProfiles', 'staff-one'), {
      uid: 'staff-one', email: 'staff@example.com', role: 'doctor', active: true,
    }));
  });

  it('scopes a doctor schedule to the doctor ID in the trusted claim', async () => {
    const db = testEnv.authenticatedContext('doctor-one', { role: 'doctor', doctorId: 'maharana' }).firestore();
    const schedule = { doctorId: 'maharana', sessions: [{ weekday: 1, start: '09:00', end: '12:00' }], updatedAt: '2026-10-09T00:00:00.000Z', updatedBy: 'doctor-one' };
    await assertSucceeds(setDoc(doc(db, 'doctorSchedules', 'maharana'), schedule));
    await assertFails(setDoc(doc(db, 'doctorSchedules', 'another-doctor'), { ...schedule, doctorId: 'another-doctor' }));
  });
});
