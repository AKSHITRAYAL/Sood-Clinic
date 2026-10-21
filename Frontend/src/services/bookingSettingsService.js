import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

export const getBookingSettings = async () => {
  const { data } = await httpsCallable(functions, 'getAdminBookingConfiguration')();
  if (!data?.settings || !Array.isArray(data.visitTypes) || typeof data.updatedAt !== 'string') throw new Error('Booking configuration could not be loaded. Reload before editing.');
  return data;
};
export const saveBookingSettings = async (kind, payload, expectedUpdatedAt, requestId) => {
  const { data } = await httpsCallable(functions, kind === 'settings' ? 'saveBookingPolicy' : 'saveBookingVisitTypes')({ [kind === 'settings' ? 'settings' : 'record']: payload, expectedUpdatedAt, requestId });
  if (data?.saved !== true) throw new Error('Save could not be confirmed. Retry unchanged details or reload before editing.');
  return data;
};
