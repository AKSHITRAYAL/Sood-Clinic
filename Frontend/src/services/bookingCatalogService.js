import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

// Deliberately a service boundary: React consumes a stable booking catalogue
// regardless of whether the implementation is Firebase or a future backend.
export const getBookingCatalog = async () => {
  const invoke = httpsCallable(functions, 'getBookingCatalog');
  const result = await invoke();
  return result.data;
};
