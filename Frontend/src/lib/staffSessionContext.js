import { createContext, useContext } from 'react';
import { staffAccessState } from '../services/staffSessionService';
export const StaffContext = createContext(null);
export function useStaffAccess(role) {
  const session = useContext(StaffContext);
  if (!session) throw new Error('Staff pages require StaffAccessProvider.');
  return { ...session, state: staffAccessState(session, role) };
}
