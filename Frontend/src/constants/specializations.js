export const DEFAULT_SPECIALIZATIONS = [
  'General Medicine', 'Cardiology', 'Dermatology', 'Endocrinology', 'ENT', 'Gastroenterology',
  'Gynecology & Obstetrics', 'Neurology', 'Ophthalmology', 'Orthopedics', 'Pediatrics',
  'Psychiatry', 'Pulmonology', 'Radiology', 'Urology',
];

export const specializationOptions = (departments = []) => Array.from(
  new Set([...DEFAULT_SPECIALIZATIONS, ...departments.map((department) => department.name).filter(Boolean)])
).sort();
