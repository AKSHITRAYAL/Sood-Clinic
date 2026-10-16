import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

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

  it('keeps clinical history and documents out of manager/admin reads while allowing the owning patient and doctor', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'patients', 'patient-one', 'medicalHistory', 'entry-one'), { details: 'Clinical history' });
      await setDoc(doc(db, 'patients', 'patient-one', 'medicalDocuments', 'document-one'), { title: 'Clinic report' });
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

  it('allows a verified linked patient to read the registry record and appointments', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'patients', 'clinic-record'), { displayName: 'Clinic Patient', linkedUids: ['account-one'] });
      await setDoc(doc(db, 'appointments', 'linked-appointment'), { patientId: 'clinic-record', status: 'scheduled' });
    });
    const db = testEnv.authenticatedContext('account-one', { email: 'patient@example.com' }).firestore();
    await assertSucceeds(getDoc(doc(db, 'patients', 'clinic-record')));
    await assertSucceeds(getDoc(doc(db, 'appointments', 'linked-appointment')));
    await assertFails(getDoc(doc(db, 'patientLinkRequests', 'request-one')));
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

  it('never lets an administrator browser session write staff access records', async () => {
    const db = testEnv.authenticatedContext('admin-one', { role: 'admin', email: 'admin@example.com' }).firestore();
    await assertFails(setDoc(doc(db, 'staffProfiles', 'staff-one'), {
      uid: 'staff-one', email: 'staff@example.com', role: 'doctor', active: true,
    }));
  });

  it('denies direct browser schedule and exception writes even for the assigned doctor', async () => {
    const db = testEnv.authenticatedContext('doctor-one', { role: 'doctor', doctorId: 'maharana' }).firestore();
    const schedule = { doctorId: 'maharana', sessions: [{ weekday: 1, start: '09:00', end: '12:00' }], updatedAt: '2026-10-09T00:00:00.000Z', updatedBy: 'doctor-one' };
    await assertFails(setDoc(doc(db, 'doctorSchedules', 'maharana'), schedule));
    await assertFails(setDoc(doc(db, 'doctorSchedules', 'another-doctor'), { ...schedule, doctorId: 'another-doctor' }));
    await assertFails(setDoc(doc(db, 'scheduleExceptions', 'maharana_2026-10-10'), { doctorId: 'maharana', dateKey: '2026-10-10', type: 'closed', sessions: [] }));
    await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), 'scheduleExceptions', 'maharana_2026-10-10')));
  });

  it('keeps scheduler-private collections server-only and limits staff reads', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'calendarBlocks', 'block-one'), { doctorId: 'maharana' });
      await setDoc(doc(db, 'appointments', 'appointment-one', 'staffNotes', 'note-one'), { text: 'Internal note' });
    });
    const anonymous = testEnv.unauthenticatedContext().firestore();
    const patient = testEnv.authenticatedContext('patient-one').firestore();
    const manager = testEnv.authenticatedContext('manager-one', { role: 'manager' }).firestore();

    await assertFails(getDoc(doc(anonymous, 'calendarBlocks', 'block-one')));
    await assertFails(getDoc(doc(patient, 'calendarBlocks', 'block-one')));
    await assertSucceeds(getDoc(doc(manager, 'calendarBlocks', 'block-one')));
    await assertSucceeds(getDoc(doc(manager, 'appointments', 'appointment-one', 'staffNotes', 'note-one')));
    for (const collection of ['appointmentPrivate', 'waitlist', 'visitTypes', 'bookingReferences', 'calendarFeeds']) {
      await assertFails(getDoc(doc(manager, collection, 'record-one')));
      await assertFails(setDoc(doc(manager, collection, 'record-two'), { value: true }));
    }
    await assertFails(setDoc(doc(manager, 'calendarBlocks', 'browser-block'), { doctorId: 'maharana' }));
    await assertFails(setDoc(doc(manager, 'appointments', 'appointment-one', 'staffNotes', 'browser-note'), { text: 'No' }));
  });

  it('keeps every server-only scheduler collection out of reach for all five roles', async () => {
    const serverOnly = ['appointmentPrivate', 'waitlist', 'visitTypes', 'bookingReferences', 'calendarFeeds'];
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'appointments', 'appointment-one'), { patientId: 'patient-one', doctorId: 'maharana', status: 'scheduled' });
      for (const collection of serverOnly) await setDoc(doc(db, collection, 'record-one'), { value: true });
    });
    const patient = testEnv.authenticatedContext('patient-one', { email: 'patient@example.com' }).firestore();
    const roles = [
      ['anonymous', testEnv.unauthenticatedContext().firestore()],
      ['patient', patient],
      ['manager', testEnv.authenticatedContext('manager-one', { role: 'manager' }).firestore()],
      ['doctor', testEnv.authenticatedContext('doctor-one', { role: 'doctor', doctorId: 'maharana' }).firestore()],
      ['admin', testEnv.authenticatedContext('admin-one', { role: 'admin' }).firestore()],
    ];

    for (const [, db] of roles) {
      for (const collection of serverOnly) {
        await assertFails(getDoc(doc(db, collection, 'record-one')));
        await assertFails(setDoc(doc(db, collection, 'record-two'), { value: true }));
        await assertFails(deleteDoc(doc(db, collection, 'record-one')));
      }
    }

    // The owning patient may read the appointment itself, but never its internal side
    // document, which holds the manage-token hash, the creator uid and the calendar ids.
    await assertSucceeds(getDoc(doc(patient, 'appointments', 'appointment-one')));
    await assertFails(getDoc(doc(patient, 'appointmentPrivate', 'appointment-one')));
  });
});
