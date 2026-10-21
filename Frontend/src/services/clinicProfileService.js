import { getDataConnect } from 'firebase/data-connect';
import { getPublicClinicContact, connectorConfig } from '../../../SQL/generated/clinic/esm/index.esm.js';
import { firebaseApp } from '../lib/firebase';

let cached;
let expiresAt = 0;

export const clearClinicContactCache = () => { cached = undefined; expiresAt = 0; };

export const getClinicContact = () => {
  if (cached && Date.now() < expiresAt) return cached;
  expiresAt = Date.now() + 5 * 60 * 1000;
  cached = getPublicClinicContact(getDataConnect(firebaseApp, connectorConfig)).then(({ data }) => {
    const contact = data.clinicProfile;
    if (!contact || !['name', 'phone', 'email', 'address', 'timezone'].every((field) => typeof contact[field] === 'string' && contact[field].trim())) {
      throw new Error('Clinic contact is unavailable.');
    }
    if (!/^\+[1-9]\d{7,14}$/.test(contact.phone) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
      throw new Error('Clinic contact is unavailable.');
    }
    return contact;
  }).catch(() => {
    cached = undefined;
    throw new Error('We could not load the clinic contact details. Please try again.');
  });
  return cached;
};
