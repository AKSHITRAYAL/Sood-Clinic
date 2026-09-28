import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import drAkSoodProfile from '../assets/brand/dr-ak-sood-profile.png';

const About = () => {
  return (
    <>
    <Navbar/>
    <main className="bg-[#f7fbff] py-12 md:py-20">
      <section className="mx-auto grid w-[min(1100px,calc(100%-2rem))] items-center gap-10 md:grid-cols-[.9fr_1.1fr]">
        <img src={drAkSoodProfile} alt="Dr. Brig. A. K. Sood VSM (Retd)" className="h-full min-h-[330px] w-full rounded-3xl object-cover object-top shadow-xl" />
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-sky-700">Sood Clinic · Panchkula</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#173f76] md:text-5xl">Dr. Brig. A. K. Sood VSM (Retd)</h1>
          <p className="mt-4 text-lg font-semibold text-slate-600">Clinic Owner · Gastroenterologist</p>
          <p className="mt-6 leading-8 text-slate-600">Dr. Brig. A. K. Sood VSM (Retd) is the founder and consulting gastroenterologist at Sood Clinic in Panchkula. With more than 38 years of clinical experience, he brings a long-standing, patient-centred approach to digestive health consultations and ongoing care.</p>
          <p className="mt-4 leading-8 text-slate-600">His practice is focused on making specialist consultation clear and accessible: listening carefully, explaining the next steps in plain language, and helping patients make informed decisions about their care. Appointments are available at the clinic and through video consultation.</p>
        </div>
      </section>
      <section className="mx-auto mt-12 grid w-[min(1100px,calc(100%-2rem))] gap-5 md:grid-cols-3">
        <article className="rounded-2xl border border-sky-100 bg-white p-7 shadow-sm"><p className="text-sm font-bold uppercase tracking-wider text-sky-700">Qualifications</p><p className="mt-3 text-xl font-extrabold text-[#173f76]">MBBS · MD · DNB · DM</p><p className="mt-3 text-sm leading-6 text-slate-600">Published professional qualifications in medicine and gastroenterology.</p></article>
        <article className="rounded-2xl border border-sky-100 bg-white p-7 shadow-sm"><p className="text-sm font-bold uppercase tracking-wider text-sky-700">Registration</p><p className="mt-3 text-xl font-extrabold text-[#173f76]">HR886</p><p className="mt-3 text-sm leading-6 text-slate-600">Registered with the Haryana Medical Council in 1987.</p></article>
        <article className="rounded-2xl border border-sky-100 bg-white p-7 shadow-sm"><p className="text-sm font-bold uppercase tracking-wider text-sky-700">Consultation hours</p><p className="mt-3 text-xl font-extrabold text-[#173f76]">Monday–Saturday</p><p className="mt-3 text-sm leading-6 text-slate-600">8:00–10:00 AM and 5:00–6:30 PM. Please confirm availability before visiting.</p></article>
      </section>
      <section className="mx-auto mt-12 w-[min(1100px,calc(100%-2rem))] rounded-3xl bg-[#173f76] px-7 py-10 text-white md:px-12">
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-sky-200">Sood Clinic</p>
        <h2 className="mt-3 text-3xl font-extrabold">Specialist gastroenterology care, close to home.</h2>
        <p className="mt-4 max-w-3xl leading-8 text-sky-50">Sood Clinic is located at House No. 398, Sector 10, Panchkula, Haryana 134109. The clinic provides in-clinic visits and video consultations in English. Consultation charges and availability can vary, so patients are encouraged to confirm their preferred time while booking.</p>
      </section>
    </main>
    <Footer />
    </>

  );
};

export default About;
