import { getAnalytics, isSupported } from 'firebase/analytics';
import { browserLocalPersistence, getAuth, setPersistence } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

// Firebase web configuration identifies this public web app; it is not a server secret.
const firebaseConfig = {
  apiKey: 'AIzaSyD_J_3zGGbYLvevaexLnEmxR9hIugIXkAc',
  authDomain: 'sood-clinic.firebaseapp.com',
  projectId: 'sood-clinic',
  storageBucket: 'sood-clinic.firebasestorage.app',
  messagingSenderId: '266523934391',
  appId: '1:266523934391:web:e824a9592a9380face1732',
  measurementId: 'G-HZ5942BBLN',
};

export const firebaseApp = initializeApp(firebaseConfig);
export const firestore = getFirestore(firebaseApp);
export const functions = getFunctions(firebaseApp, 'asia-south1');
export const auth = getAuth(firebaseApp);
// Explicit local persistence prevents staff/patient sessions from disappearing on refresh.
export const authReady = setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error('Unable to configure authentication persistence.', error);
});

export async function initializeAnalytics() {
  if (typeof window === 'undefined' || !(await isSupported())) return null;
  return getAnalytics(firebaseApp);
}
