// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getClinicContact: vi.fn() }));
vi.mock('../services/clinicProfileService', () => ({ getClinicContact: mocks.getClinicContact }));
import Footer from './Footer';

const contact = { name: 'Sood Clinic', phone: '+918988207797', email: 'clinic@example.com', address: 'Clinic address', timezone: 'Asia/Kolkata' };
const mount = () => render(<MemoryRouter><Footer /></MemoryRouter>);
const deferred = () => { let resolve, reject; const promise = new Promise((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

test('the published clinic phone and email become tel: and mailto: links from one read', async () => {
  mocks.getClinicContact.mockResolvedValue(contact);
  mount();
  const phone = await screen.findByText(contact.phone);
  expect(phone.getAttribute('href')).toBe(`tel:${contact.phone}`);
  expect(screen.getByText(contact.email).getAttribute('href')).toBe(`mailto:${contact.email}`);
  expect(mocks.getClinicContact).toHaveBeenCalledTimes(1);
});

test('while loading and after a failure the footer links to the contact page, never an invented number', async () => {
  const pending = deferred();
  mocks.getClinicContact.mockReturnValueOnce(pending.promise);
  mount();
  expect(screen.getByText('Clinic phone and email').getAttribute('href')).toBe('/contact');
  expect(document.querySelector('a[href^="tel:"]')).toBeNull();

  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  pending.reject(new Error('synthetic contact failure'));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(screen.getByText('Clinic phone and email').getAttribute('href')).toBe('/contact');
  expect(document.querySelector('a[href^="tel:"]')).toBeNull();
  expect(consoleError).not.toHaveBeenCalled();
  expect(consoleWarn).not.toHaveBeenCalled();
  consoleError.mockRestore(); consoleWarn.mockRestore();
});

test('a contact answer that arrives after unmount changes nothing', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const pending = deferred();
  mocks.getClinicContact.mockReturnValueOnce(pending.promise);
  const view = mount();
  view.unmount();
  pending.resolve(contact);
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(consoleError).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain(contact.phone);
  consoleError.mockRestore();
});

const sourceRoot = async () => {
  for (const prefix of ['Frontend/src', 'src']) {
    try { await readFile(`${globalThis.process.cwd()}/${prefix}/entry/staff.jsx`); return `${globalThis.process.cwd()}/${prefix}`; } catch { /* keep looking */ }
  }
  throw new Error('Frontend sources were not found from the working directory.');
};

test('no phone number is hard-coded in the footer and no developer-facing copy remains', async () => {
  const root = await sourceRoot();
  const footer = await readFile(`${root}/components/Footer.jsx`, 'utf8');
  expect(footer).not.toMatch(/\+\d{9,}/);
  expect(footer).not.toMatch(/tel:\+/);
  for (const file of ['ManagerWorkspace.jsx', 'StaffAdmin.jsx', 'StaffAccess.jsx']) {
    const source = await readFile(`${root}/pages/${file}`, 'utf8');
    for (const banned of ['Blaze', 'Firebase Storage', 'Firebase Admin command', 'Firebase ID tokens', '<code>admin</code>']) {
      expect(source, `${file} still mentions ${banned}`).not.toContain(banned);
    }
  }
});

test('every public page that can be reached still renders the footer, and the contact page uses the same record', async () => {
  const root = await sourceRoot();
  for (const page of ['Home', 'About', 'Contact', 'HealthGuides', 'PatientExperience', 'Bookappointment', 'Login', 'PublicNotFound']) {
    const source = await readFile(`${root}/pages/${page}.jsx`, 'utf8');
    expect(source, `${page} does not render the footer`).toContain("components/Footer");
  }
  const contact = await readFile(`${root}/pages/Contact.jsx`, 'utf8');
  expect(contact).toContain('getClinicContact');
  expect(contact).toContain('tel:${contact.phone}');
  expect(contact).toContain('mailto:${contact.email}');
  const routes = `${await readFile(`${root}/entry/public.jsx`, 'utf8')}${await readFile(`${root}/main.jsx`, 'utf8').catch(() => '')}`;
  for (const path of ['/', '/about', '/contact', '/guides', '/experience', '/book', '/login']) expect(routes).toContain(`path="${path}"`);
});
