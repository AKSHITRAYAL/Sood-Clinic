import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

export async function manageStaffAccess(payload) {
  try {
    return await httpsCallable(functions, 'manageStaffAccount')({ ...payload, requestId: crypto.randomUUID() });
  } catch (error) {
    const messages = {
      'functions/permission-denied': 'Your administrator session could not be verified. Please sign in again.',
      'functions/already-exists': 'This email already belongs to an account. Manage its existing access instead.',
      'functions/failed-precondition': 'This change is not allowed for the selected account. Refresh the directory and check its current access.',
      'functions/invalid-argument': 'Check the name, email, role, doctor identifier and password requirements.',
    };
    throw new Error(messages[error?.code] || 'The staff change could not be confirmed. Refresh the directory and activity log before trying again.');
  }
}

export const getSqlStaffDirectory = async (page = {}) => {
  try {
    const { data } = await httpsCallable(functions, 'getSqlStaffDirectory')(page);
    if (!Array.isArray(data?.staff) || !Number.isInteger(data.total) || data.total < 0
      || (data.nextCursor !== null && typeof data.nextCursor !== 'string')) throw new Error('Invalid directory response.');
    return data;
  } catch (error) {
    const message = error?.code === 'functions/permission-denied'
      ? 'Your administrator session could not be verified. Please sign in again.'
      : 'The staff directory could not be loaded. Please try again.';
    throw new Error(message);
  }
};
