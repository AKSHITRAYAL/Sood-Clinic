// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, test } from 'vitest';

import Footer from './Footer';
import { clinicPhones, doctorEmail } from '../lib/clinicLocations';
afterEach(cleanup);
test('footer renders each clinic contact with the correct telephone and email link', () => {
  render(<MemoryRouter><Footer /></MemoryRouter>);
  for (const phone of clinicPhones) expect(screen.getByRole('link', { name: phone.display }).getAttribute('href')).toBe(`tel:${phone.tel}`);
  expect(screen.getByRole('link', { name: doctorEmail }).getAttribute('href')).toBe(`mailto:${doctorEmail}`);
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
  for (const page of ['Home', 'About', 'Contact', 'HealthGuides', 'Reviews', 'Bookappointment', 'Login', 'PublicNotFound']) {
    const source = await readFile(`${root}/pages/${page}.jsx`, 'utf8');
    expect(source, `${page} does not render the footer`).toContain("components/Footer");
  }
  const contact = await readFile(`${root}/pages/Contact.jsx`, 'utf8');
  expect(contact).toContain("from '../lib/clinicLocations'");
  expect(contact).toContain('tel:${phone.replaceAll');
  expect(contact).toContain('mailto:${doctorEmail}');
  const routes = `${await readFile(`${root}/entry/public.jsx`, 'utf8')}${await readFile(`${root}/main.jsx`, 'utf8').catch(() => '')}`;
  for (const path of ['/', '/about', '/contact', '/guides', '/experience', '/reviews', '/book', '/login']) expect(routes).toContain(`path="${path}"`);
});
