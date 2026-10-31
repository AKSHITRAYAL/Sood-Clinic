import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { appointmentPhone, clinicLocations, doctorEmail } from '../lib/clinicLocations';

const Contact = () => (
  <>
    <Navbar />
    <main className="container mx-auto max-w-6xl px-5 py-12">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Visit Sood Clinic</p>
      <h1 className="mt-3 text-4xl font-bold">Contact &amp; clinic information</h1>
      <p className="mt-4 max-w-3xl leading-7 text-slate-600">Call <a className="font-semibold text-[#176dcc]" href={`tel:${appointmentPhone.replaceAll(' ', '')}`}>{appointmentPhone}</a> or email <a className="font-semibold text-[#176dcc]" href={`mailto:${doctorEmail}`}>{doctorEmail}</a> for appointment enquiries.</p>
      <p className="mt-3 max-w-3xl font-medium text-slate-700">Jindal Diagnostics is for OPD consultations only. Dhawan Hospital offers both OPD consultations and procedures.</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {clinicLocations.map((location) => <section key={location.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          <div className="p-7">
            <h2 className="text-2xl font-semibold">{location.name}</h2>
            <p className="mt-4 leading-7">{location.address}</p>
            <h3 className="mt-6 text-lg font-semibold">Consultation hours</h3>
            <ul className="mt-2 space-y-1">{location.hours.map((hours) => <li key={hours}>{hours}</li>)}</ul>
            {location.phone && <><h3 className="mt-6 text-lg font-semibold">Hospital phone</h3><a className="mt-2 inline-flex text-lg font-semibold text-[#176dcc]" href="tel:+911722596090">{location.phone}</a></>}
            <p className="mt-5 text-sm text-slate-600">{location.services}</p>
            <a className="mt-6 inline-flex rounded-lg bg-[#176dcc] px-5 py-3 font-medium text-white hover:bg-[#0f5bad]" href={location.directions} target="_blank" rel="noreferrer">Get directions</a>
          </div>
          <iframe title={`${location.name} map`} className="h-72 w-full border-0" src={`https://www.google.com/maps?q=${encodeURIComponent(location.address)}&output=embed`} allowFullScreen loading="lazy" />
        </section>)}
      </div>
      <p className="mt-6 text-sm text-slate-500">Sunday is listed as closed on the supplied clinic profile. Please confirm before visiting.</p>
    </main>
    <Footer />
  </>
);

export default Contact;
