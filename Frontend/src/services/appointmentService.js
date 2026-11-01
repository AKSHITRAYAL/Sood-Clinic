import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

export const listStaffAppointments = async (dateKey, cursor = null) => {
  const result = await httpsCallable(functions, 'listStaffAppointments')({ dateKey, ...(cursor ? { cursor } : {}) });
  if (!Array.isArray(result.data?.appointments) || result.data.appointments.length > 100) throw new Error('Appointments could not be confirmed. Refresh to retry.');
  return result.data;
};

export const transitionAppointment = async (appointmentId, to, reason = '') => {
  const invoke = httpsCallable(functions, 'transitionAppointment');
  return invoke({ appointmentId, to, reason });
};

export const cancelPatientAppointment = async (appointmentId, reason = '') => {
  const invoke = httpsCallable(functions, 'cancelPatientAppointment');
  return invoke({ appointmentId, reason });
};

export const reschedulePatientAppointment = async (appointmentId, dateKey, time) => {
  const invoke = httpsCallable(functions, 'reschedulePatientAppointment');
  return invoke({ appointmentId, dateKey, time });
};

export const rescheduleStaffAppointment = async (appointmentId, dateKey, time) => {
  const invoke = httpsCallable(functions, 'rescheduleAppointment');
  return invoke({ appointmentId, dateKey, time });
};

export const closeDay = async ({ doctorId, dateKey, mode = 'preview', action = 'keep', reason = '' }) => {
  const invoke = httpsCallable(functions, 'closeDay');
  return invoke({ doctorId, dateKey, mode, action, reason });
};
