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

  it('allows a patient to maintain only their own profile fields', async () => {
    const db = testEnv.authenticatedContext('patient-one', { email: 'patient@example.com' }).firestore();
    const profile = doc(db, 'patients', 'patient-one');
    const record = {
      displayName: 'Patient One', email: 'patient@example.com', title: '', phone: '',
      dateOfBirth: '', gender: '', maritalStatus: '', bloodGroup: '', addressLine1: '',
      city: '', state: '', postalCode: '', emergencyContactName: '', emergencyContactPhone: '',
      allergies: '', currentMedications: '', healthNotes: '', createdAt: '2026-10-06T00:00:00.000Z',
      updatedAt: '2026-10-06T00:00:00.000Z',
    };

    await assertSucceeds(setDoc(profile, record));
    await assertSucceeds(updateDoc(profile, { phone: '9999999999', updatedAt: '2026-10-06T00:01:00.000Z' }));
    await assertFails(updateDoc(profile, { staffOnlyNote: 'not permitted' }));
  });

  it('does not let a patient author clinic medical documents', async () => {
    const db = testEnv.authenticatedContext('patient-one', { email: 'patient@example.com' }).firestore();
    await assertFails(setDoc(doc(db, 'patients', 'patient-one', 'medicalDocuments', 'record-one'), { title: 'Self upload' }));
  });
});
