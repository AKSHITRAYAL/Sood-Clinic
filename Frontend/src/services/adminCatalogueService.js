import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

export const getAdminCatalogue = async () => {
  const { data } = await httpsCallable(functions, 'getAdminBookingCatalog')();
  if (!data || !['branches', 'departments', 'doctors'].every(key => Array.isArray(data[key]))) throw new Error('The catalogue could not be loaded. Please retry.');
  return data;
};

export const saveAdminCatalogue = async (action, record, requestId) => {
  const fields = ['id', 'name', 'active', ...(action === 'branch' ? ['code', 'address'] : action === 'department' ? ['branchId', 'code', 'description', 'sortOrder', 'publicBookingEnabled'] : ['branchId', 'departmentIds', 'qualification', 'registrationNumber', 'bookingEnabled'])];
  const payload = Object.fromEntries(fields.map(key => [key, key === 'sortOrder' ? Number(record[key]) : record[key]]));
  const { data } = await httpsCallable(functions, 'manageBookingCatalog')({ action, record: payload, expectedUpdatedAt: record.updatedAt ?? null, requestId });
  if (data?.saved !== true) throw new Error('Save could not be confirmed. Retry unchanged details or reload before editing.');
  return data;
};
