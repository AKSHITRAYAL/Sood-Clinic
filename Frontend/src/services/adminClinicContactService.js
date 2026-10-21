import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { clearClinicContactCache } from './clinicProfileService';

export const getAdminClinicContact = async () => {
  const { data } = await httpsCallable(functions, 'getAdminClinicContact')();
  const profile = data?.profile;
  if (!profile || !['name', 'phone', 'email', 'address', 'updatedAt'].every(key => typeof profile[key] === 'string' && profile[key])) {
    throw new Error('Clinic contact could not be loaded. Please retry.');
  }
  return profile;
};

export const saveAdminClinicContact = async (input) => {
  const { data } = await httpsCallable(functions, 'saveAdminClinicContact')(input);
  if (data?.saved !== true) throw new Error('The save could not be confirmed. Retry unchanged details or reload before editing.');
  clearClinicContactCache();
  return data;
};
