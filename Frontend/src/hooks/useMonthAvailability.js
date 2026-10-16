import { getMonthAvailability } from '../services/schedulerService';
import { useSchedulerRequest } from './useSchedulerRequest';

export const useMonthAvailability = ({ doctorId, visitTypeId, month }) => useSchedulerRequest(
  () => getMonthAvailability({ doctorId, visitTypeId, month }),
  `${doctorId || ''}:${visitTypeId || ''}:${month || ''}`,
  Boolean(doctorId && visitTypeId && month),
);
