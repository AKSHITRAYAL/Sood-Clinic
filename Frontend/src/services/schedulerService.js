import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';

const call = (name, input) => httpsCallable(functions, name)(input).then((result) => result.data);

export const getBookingCatalog = () => call('getBookingCatalog');
export const getMonthAvailability = (input) => call('getMonthAvailability', input);
export const getAvailability = (input) => call('getAvailability', input);
export const holdSlot = (input) => call('holdSlot', input);
export const releaseHold = (input) => call('releaseHold', input);
export const createBooking = (input) => call('createBooking', input);
export const getBookingByToken = (input) => call('getBookingByToken', input);
export const cancelBookingByToken = (input) => call('cancelBookingByToken', input);
export const rescheduleBookingByToken = (input) => call('rescheduleBookingByToken', input);
export const createStaffAppointment = (input) => call('createStaffAppointment', input);
export const moveAppointment = (input) => call('moveAppointment', input);
export const saveCalendarBlock = (input) => call('saveCalendarBlock', input);
export const deleteCalendarBlock = (input) => call('deleteCalendarBlock', input);
export const addStaffNote = (input) => call('addStaffNote', input);
export const joinWaitlist = (input) => call('joinWaitlist', input);
export const transitionAppointment = (input) => call('transitionAppointment', input);
export const getDoctorPatientSummary = (input) => call('getDoctorPatientSummary', input);
