import { getAnalytics, isSupported } from 'firebase/analytics';
import { initializeApp } from 'firebase/app';

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

export async function initializeAnalytics() {
  if (typeof window === 'undefined' || !(await isSupported())) return null;
  return getAnalytics(firebaseApp);
}
