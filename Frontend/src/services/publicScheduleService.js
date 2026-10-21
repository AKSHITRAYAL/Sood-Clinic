import { getDataConnect } from 'firebase/data-connect';
import { getPublicDoctorHours as getPublicDoctorHoursQuery, connectorConfig } from '../../../SQL/generated/clinic/esm/index.esm.js';
import { firebaseApp } from '../lib/firebase';

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const validMinute = (value) => Number.isInteger(value) && value >= 0 && value <= 1439;

const normalizeWindows = (rows) => {
  if (!Array.isArray(rows) || rows.length > 4) throw new Error('Clinic hours are unavailable.');
  let previous = -1;
  return rows.map((row) => {
    if (!validMinute(row?.startMinute) || !validMinute(row?.endMinute) || row.startMinute >= row.endMinute || row.startMinute < previous) {
      throw new Error('Clinic hours are unavailable.');
    }
    previous = row.endMinute;
    return { startMinute: row.startMinute, endMinute: row.endMinute };
  });
};

export const getPublicDoctorHours = async ({ doctorId, date, weekday }) => {
  if (typeof doctorId !== 'string' || !doctorId.trim() || !datePattern.test(date) || !Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    throw new Error('Choose a valid clinic date and doctor.');
  }
  const { data } = await getPublicDoctorHoursQuery(getDataConnect(firebaseApp, connectorConfig), {
    doctorLegacyId: doctorId.trim(), date, weekday,
  });
  if (!Array.isArray(data?.doctors) || data.doctors.length !== 1) throw new Error('Clinic hours are unavailable.');
  const doctor = data.doctors[0];
  if (doctor.legacyId !== doctorId.trim() || doctor.branch?.timezone !== 'Asia/Kolkata' || doctor.state?.authority !== 'doctor_schedule') {
    throw new Error('Clinic hours are unavailable.');
  }
  const exceptions = Array.isArray(doctor.exceptions) ? doctor.exceptions : [];
  if (exceptions.length > 1 || (exceptions[0] && exceptions[0].date !== date)) throw new Error('Clinic hours are unavailable.');
  const exception = exceptions[0];
  const windows = exception ? normalizeWindows(exception.sessions) : normalizeWindows(doctor.weekly);
  const kind = exception?.kind || 'weekly';
  if (kind !== 'weekly' && !['extra', 'replace', 'closed'].includes(kind)) throw new Error('Clinic hours are unavailable.');
  return { doctorId: doctor.legacyId, doctorName: doctor.name, date, timezone: 'Asia/Kolkata', kind, windows };
};
