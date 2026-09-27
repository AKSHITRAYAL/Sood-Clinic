import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const clinicAddress = 'House No. 398, Sector 10, Panchkula, Haryana 134109, India';

const Contact = () => (
  <>
    <Navbar />
    <main className="container mx-auto max-w-6xl px-5 py-12">
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Visit Sood Clinic</p>
      <h1 className="mt-3 text-4xl font-bold">Contact &amp; clinic information</h1>
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <section className="rounded-2xl border bg-white p-7 shadow-sm">
          <h2 className="text-2xl font-semibold">Sood Clinic</h2>
          <p className="mt-4 leading-7">{clinicAddress}</p>
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

export default Contact;
