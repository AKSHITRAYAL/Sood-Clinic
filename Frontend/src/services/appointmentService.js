import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

export const transitionAppointment = async (appointmentId, to, reason = '') => {
  const invoke = httpsCallable(functions, 'transitionAppointment');
  return invoke({ appointmentId, to, reason });
};

export const cancelPatientAppointment = async (appointmentId, reason = '') => {
  const invoke = httpsCallable(functions, 'cancelPatientAppointment');
  return invoke({ appointmentId, reason });
};
