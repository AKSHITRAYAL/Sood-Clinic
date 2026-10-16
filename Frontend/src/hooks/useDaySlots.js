import { getAvailability } from '../services/schedulerService';
import { useSchedulerRequest } from './useSchedulerRequest';

export const useDaySlots = ({ doctorId, visitTypeId, dateKey }) => useSchedulerRequest(
  () => getAvailability({ doctorId, visitTypeId, dateKey }),
  `${doctorId || ''}:${visitTypeId || ''}:${dateKey || ''}`,
  Boolean(doctorId && visitTypeId && dateKey),
);
