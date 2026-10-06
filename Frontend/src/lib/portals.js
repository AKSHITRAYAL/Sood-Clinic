// Each app is hosted independently, even though both use the same Firebase project.
// Keep cross-portal navigation as full-page navigation rather than React routes.
export const PUBLIC_ORIGIN = import.meta.env.VITE_PUBLIC_ORIGIN || 'https://sood-clinic.web.app';
export const STAFF_ORIGIN = import.meta.env.VITE_STAFF_ORIGIN || 'https://sood-clinic-staff.web.app';

export const publicUrl = (path = '/') => new URL(path, PUBLIC_ORIGIN).toString();
export const staffUrl = (path = '/') => new URL(path, STAFF_ORIGIN).toString();
