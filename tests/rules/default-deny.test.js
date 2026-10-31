import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';

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

  it('keeps consultation requests and proposals callable-only', async () => {
    const staff = testEnv.authenticatedContext('admin-one', { role: 'admin' }).firestore();
    const guest = testEnv.unauthenticatedContext().firestore();
    const patient = testEnv.authenticatedContext('patient-one', { role: 'patient' }).firestore();

    for (const db of [guest, patient, staff]) {
      await assertFails(getDoc(doc(db, 'consultationRequests', 'request-one')));
      await assertFails(setDoc(doc(db, 'consultationRequests', 'request-one'), { status: 'pending' }));
      await assertFails(getDoc(doc(db, 'appointmentProposals', 'proposal-one')));
      await assertFails(setDoc(doc(db, 'appointmentProposals', 'proposal-one'), { status: 'pending' }));
    }
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

  it('keeps patient profiles out of non-admin staff browser sessions', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'patients', 'patient-one'), { displayName: 'Patient One' });
    });
    const manager = testEnv.authenticatedContext('manager-one', { role: 'manager' }).firestore();
    const doctor = testEnv.authenticatedContext('doctor-one', { role: 'doctor', doctorId: 'maharana' }).firestore();
    const admin = testEnv.authenticatedContext('admin-one', { role: 'admin' }).firestore();

    await assertFails(getDoc(doc(manager, 'patients', 'patient-one')));
    await assertFails(getDoc(doc(doctor, 'patients', 'patient-one')));
    await assertSucceeds(getDoc(doc(admin, 'patients', 'patient-one')));
  });

  it('keeps clinical history and documents out of manager/admin reads while allowing the owning patient and doctor', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'patients', 'patient-one', 'medicalHistory', 'entry-one'), { doctorId: 'maharana', details: 'Clinical history' });
      await setDoc(doc(db, 'patients', 'patient-one', 'medicalDocuments', 'document-one'), { doctorId: 'maharana', title: 'Clinic report' });
    });
    const patient = testEnv.authenticatedContext('patient-one', { email: 'patient@example.com' }).firestore();
    const doctor = testEnv.authenticatedContext('doctor-one', { role: 'doctor', doctorId: 'maharana' }).firestore();
    const manager = testEnv.authenticatedContext('manager-one', { role: 'manager' }).firestore();
    const admin = testEnv.authenticatedContext('admin-one', { role: 'admin' }).firestore();
    const history = doc(patient, 'patients', 'patient-one', 'medicalHistory', 'entry-one');
    const document = doc(patient, 'patients', 'patient-one', 'medicalDocuments', 'document-one');

    await assertSucceeds(getDoc(history));
    await assertSucceeds(getDoc(doc(doctor, 'patients', 'patient-one', 'medicalHistory', 'entry-one')));
    await assertFails(getDoc(doc(manager, 'patients', 'patient-one', 'medicalHistory', 'entry-one')));
    await assertFails(getDoc(doc(admin, 'patients', 'patient-one', 'medicalDocuments', 'document-one')));
    await assertFails(getDoc(doc(manager, 'patients', 'patient-one', 'medicalDocuments', 'document-one')));
    await assertFails(setDoc(doc(manager, 'patients', 'patient-one', 'medicalDocuments', 'new-document'), { title: 'Uploaded by manager' }));
    await assertFails(setDoc(doc(manager, 'patients', 'patient-one', 'medicalHistory', 'new-history'), { details: 'Not allowed' }));
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

  it('keeps hashed booking rate-limit records server-only', async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'rateLimits', 'a1b2c3d4e5f60708a9b0c1d2e3f40506')));
    await assertFails(setDoc(doc(db, 'rateLimits', 'a1b2c3d4e5f60708a9b0c1d2e3f40506'), { count: 1 }));
  });

  it('blocks a manager with a mandatory password change from reading appointments', async () => {
    const manager = testEnv.authenticatedContext('manager-password-change', { role: 'manager', forcePasswordChange: true }).firestore();
    await assertFails(getDoc(doc(manager, 'appointments', 'appointment-one')));
  });

  it('allows a manager without a mandatory password change to read appointments', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'appointments', 'appointment-one'), { patientId: 'patient-one', status: 'scheduled' });
    });
    const manager = testEnv.authenticatedContext('manager-ready', { role: 'manager', forcePasswordChange: false }).firestore();
    await assertSucceeds(getDoc(doc(manager, 'appointments', 'appointment-one')));
  });

  it('keeps a guest appointment (null patientId) unreadable to visitors and other patients, but visible to staff', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'appointments', 'guest-one'), {
        patientId: null, doctorId: 'doctor-a', status: 'scheduled',
        patientSnapshot: { name: 'Guest One', phone: '+919000000001', email: 'guest@example.com' },
      });
    });
    const anonymous = testEnv.unauthenticatedContext().firestore();
    const patient = testEnv.authenticatedContext('patient-two', { email: 'patient-two@example.com' }).firestore();
    const doctor = testEnv.authenticatedContext('doctor-one', { role: 'doctor', doctorId: 'doctor-a' }).firestore();
    const manager = testEnv.authenticatedContext('manager-one', { role: 'manager', forcePasswordChange: false }).firestore();
    const admin = testEnv.authenticatedContext('admin-one', { role: 'admin' }).firestore();

    await assertFails(getDoc(doc(anonymous, 'appointments', 'guest-one')));
    await assertFails(getDoc(doc(patient, 'appointments', 'guest-one')));
    await assertSucceeds(getDoc(doc(doctor, 'appointments', 'guest-one')));
    await assertSucceeds(getDoc(doc(manager, 'appointments', 'guest-one')));
    await assertSucceeds(getDoc(doc(admin, 'appointments', 'guest-one')));
  });

  it('never lets an administrator browser session write staff access records', async () => {
    const db = testEnv.authenticatedContext('admin-one', { role: 'admin', email: 'admin@example.com' }).firestore();
    await assertFails(setDoc(doc(db, 'staffProfiles', 'staff-one'), {
      uid: 'staff-one', email: 'staff@example.com', role: 'doctor', active: true,
    }));
    await assertFails(getDoc(doc(db, 'staffProfiles', 'staff-one')));
  });

  it('denies direct browser schedule and exception writes even for the assigned doctor', async () => {
    const db = testEnv.authenticatedContext('doctor-one', { role: 'doctor', doctorId: 'maharana' }).firestore();
    const schedule = { doctorId: 'maharana', sessions: [{ weekday: 1, start: '09:00', end: '12:00' }], updatedAt: '2026-10-09T00:00:00.000Z', updatedBy: 'doctor-one' };
    await assertFails(setDoc(doc(db, 'doctorSchedules', 'maharana'), schedule));
    await assertFails(setDoc(doc(db, 'doctorSchedules', 'another-doctor'), { ...schedule, doctorId: 'another-doctor' }));
    await assertFails(setDoc(doc(db, 'scheduleExceptions', 'maharana_2026-10-10'), { doctorId: 'maharana', dateKey: '2026-10-10', type: 'closed', sessions: [] }));
    await assertFails(setDoc(doc(db, 'clinicSchedules', 'maharana'), schedule));
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'scheduleExceptions', 'maharana_2026-10-10')));
  });

  it('limits doctor appointment reads to their own scope, including collection queries', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'appointments', 'own'), { doctorId: 'doctor-a', patientId: 'patient-one' });
      await setDoc(doc(db, 'appointments', 'other'), { doctorId: 'doctor-b', patientId: 'patient-two' });
    });
    const db = testEnv.authenticatedContext('doctor-one', { role: 'doctor', doctorId: 'doctor-a' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'appointments', 'own')));
    await assertFails(getDoc(doc(db, 'appointments', 'other')));
    await assertFails(getDocs(collection(db, 'appointments')));
    await assertSucceeds(getDocs(query(collection(db, 'appointments'), where('doctorId', '==', 'doctor-a'))));
  });

  it('denies cross-doctor and unscoped clinical reads and ownership reassignment', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'patients', 'patient-one', 'medicalHistory', 'owned'), { doctorId: 'doctor-a', details: 'Fixture' });
      await setDoc(doc(db, 'patients', 'patient-one', 'medicalHistory', 'other'), { doctorId: 'doctor-b', details: 'Fixture' });
      await setDoc(doc(db, 'patients', 'patient-one', 'medicalDocuments', 'unscoped'), { title: 'Legacy fixture' });
    });
    const db = testEnv.authenticatedContext('doctor-one', { role: 'doctor', doctorId: 'doctor-a' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'patients', 'patient-one', 'medicalHistory', 'owned')));
    await assertFails(getDoc(doc(db, 'patients', 'patient-one', 'medicalHistory', 'other')));
    await assertFails(getDoc(doc(db, 'patients', 'patient-one', 'medicalDocuments', 'unscoped')));
    await assertFails(updateDoc(doc(db, 'patients', 'patient-one', 'medicalHistory', 'owned'), { doctorId: 'doctor-b' }));
    await assertFails(setDoc(doc(db, 'patients', 'patient-one', 'medicalHistory', 'new'), { doctorId: 'doctor-b' }));
  });
});
