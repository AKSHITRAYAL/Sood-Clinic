import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

// Deliberately a service boundary: React consumes a stable booking catalogue
// regardless of whether the implementation is Firebase or a future backend.
export const getBookingCatalog = async () => {
  const invoke = httpsCallable(functions, 'getBookingCatalog');
  const result = await invoke();
  readBookingPolicy(result.data);
  return result.data;
};

export const readBookingPolicy = (catalog) => {
  const { bookingWindowDays, cancelCutoffMinutes } = catalog?.booking || {};
  if (!Number.isInteger(bookingWindowDays) || bookingWindowDays < 1 || bookingWindowDays > 90 || !Number.isInteger(cancelCutoffMinutes) || cancelCutoffMinutes < 0 || cancelCutoffMinutes > 10080) throw new Error('Online appointment policy is temporarily unavailable.');
  return { bookingWindowDays, cancelCutoffMinutes };
};
