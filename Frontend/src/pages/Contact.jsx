import { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { getClinicContact } from '../services/clinicProfileService';

const Contact = () => {
  const [contact, setContact] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setError('');
    getClinicContact().then((result) => { if (!cancelled) setContact(result); })
      .catch((failure) => { if (!cancelled) setError(failure.message); });
    return () => { cancelled = true; };
  }, [attempt]);
  return (
  <>
    <Navbar />
    <main className="container mx-auto max-w-6xl px-5 py-12">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Visit Sood Clinic</p>
      <h1 className="mt-3 text-4xl font-bold">Contact &amp; clinic information</h1>
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <section className="rounded-2xl border bg-white p-7 shadow-sm">
          <h2 className="text-2xl font-semibold">{contact?.name || 'Clinic contact'}</h2>
          {!contact && !error && <p className="mt-4" role="status">Loading clinic details…</p>}
          {error && <div className="mt-4"><p role="alert">{error}</p><button type="button" className="mt-3 underline" onClick={() => setAttempt((value) => value + 1)}>Try again</button></div>}
          {contact && <>
            <p className="mt-4 leading-7">{contact.address}</p>
            <h3 className="mt-7 text-lg font-semibold">Phone</h3><a className="mt-2 inline-flex text-lg font-semibold text-[#176dcc] hover:text-[#0f5bad]" href={`tel:${contact.phone}`}>{contact.phone}</a>
            <h3 className="mt-7 text-lg font-semibold">Email</h3><a className="mt-2 inline-flex text-lg font-semibold text-[#176dcc] hover:text-[#0f5bad]" href={`mailto:${contact.email}`}>{contact.email}</a>
          </>}
          <h3 className="mt-7 text-lg font-semibold">Consultation hours</h3>
          <p className="mt-2">Monday–Saturday</p>
          <p>8:00 AM–10:00 AM · 5:00 PM–6:30 PM</p>
          <p className="mt-5 text-sm text-slate-500">Hours are published from the doctor’s profile and should be confirmed before visiting.</p>
          <a className="mt-6 inline-flex rounded-lg bg-[#4d8cc6] px-5 py-3 font-medium text-white hover:bg-[#3775ad]" href="https://maps.google.com/?q=House+No+398+Sector+10+Panchkula+Haryana+134109" target="_blank" rel="noreferrer">Get directions</a>
        </section>
        <section className="overflow-hidden rounded-2xl border shadow-sm">
          <iframe title="Sood Clinic location" className="h-[420px] w-full border-0" src="https://www.google.com/maps?q=House%20No%20398%2C%20Sector%2010%2C%20Panchkula%2C%20Haryana%20134109&output=embed" allowFullScreen loading="lazy" />
        </section>
      </div>
    </main>
    <Footer />
  </>
);
};

export default Contact;
