import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import drAkSoodProfile from '../assets/brand/dr-ak-sood-portrait.jpeg';
import { clinicLocations, doctorName } from '../lib/clinicLocations';

const About = () => {
  return (
    <>
    <Navbar/>
    <main className="bg-[#f7fbff] py-12 md:py-20">
      <section className="mx-auto grid w-[min(1100px,calc(100%-2rem))] items-center gap-10 md:grid-cols-[.9fr_1.1fr]">
        <img src={drAkSoodProfile} alt={doctorName} className="aspect-[4/5] w-full rounded-3xl object-cover object-center shadow-xl" />
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[.18em] text-sky-700">Sood Clinic · Panchkula</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-[#173f76] md:text-5xl">{doctorName}</h1>
          <p className="mt-4 text-lg font-semibold text-slate-600">Chief Consultant · Gastroenterology &amp; Hepatology</p>
          <p className="mt-6 leading-8 text-slate-600">Dr. A. K. Sood has returned to Panchkula after practising in Faridabad and Ghaziabad as Chief Consultant in Gastroenterology and Hepatology. He has trained in paediatric and adult upper and lower endoscopic interventions, including pancreatobiliary procedures and therapeutic endoscopic ultrasound. He has also trained in organ donation and liver transplantation.</p>
          <p className="mt-4 leading-8 text-slate-600">A teacher, guide and examiner for more than 30 years, he has served as Professor of Medicine and Gastroenterology at Army Hospital (R&amp;R), New Delhi, and Command Hospital (Western Command). He was also a personal physician to the Governor of Sikkim.</p>
        </div>
      </section>
      <section className="mx-auto mt-12 grid w-[min(1100px,calc(100%-2rem))] gap-5 md:grid-cols-2">
        <article className="rounded-2xl border border-sky-100 bg-white p-7 shadow-sm"><h2 className="text-sm font-bold uppercase tracking-wider text-sky-700">Professional qualifications</h2><p className="mt-3 text-xl font-extrabold text-[#173f76]">MBBS · MD · DNB · DM · MNAMS</p><p className="mt-3 text-sm leading-6 text-slate-600">MBBS and MD from AFMC, Pune; DNB; DM in Gastroenterology from PGIMER, Chandigarh; and MNAMS.</p></article>
        <article className="rounded-2xl border border-sky-100 bg-white p-7 shadow-sm"><h2 className="text-sm font-bold uppercase tracking-wider text-sky-700">Previous experience</h2><ul className="mt-3 list-disc space-y-2 pl-5 leading-6 text-slate-600"><li>MBBS and Junior Residency, Armed Forces Medical College, Pune</li><li>Senior Residency, PGIMER, Chandigarh</li><li>Professor of Medicine and Gastroenterology, Army Hospital (R&amp;R), New Delhi</li><li>Command Hospital (Western Command)</li><li>Deputation to the Government of Sikkim</li><li>Chief Consultant roles at Sarvodaya Hospital, Faridabad and Yashoda Hospital, Ghaziabad</li><li>Director, AORTA (Army Organ Retrieval and Transplant Authority)</li></ul></article>
      </section>
      <section className="mx-auto mt-8 grid w-[min(1100px,calc(100%-2rem))] gap-5 md:grid-cols-2">
        <article className="rounded-2xl border border-sky-100 bg-white p-7 shadow-sm"><h2 className="text-sm font-bold uppercase tracking-wider text-sky-700">Areas of expertise</h2><ul className="mt-3 grid list-disc gap-x-6 gap-y-2 pl-5 leading-6 text-slate-600 sm:grid-cols-2"><li>Irritable bowel syndrome</li><li>Inflammatory bowel disease</li><li>Chronic hepatitis B and C</li><li>Alcohol-related liver disease</li><li>Cirrhosis of the liver</li><li>Metabolic fatty liver disease</li><li>CBD stones</li><li>Pancreatic and biliary cancers with obstructive jaundice</li><li>Chronic pancreatitis</li></ul></article>
        <article className="rounded-2xl border border-sky-100 bg-white p-7 shadow-sm"><h2 className="text-sm font-bold uppercase tracking-wider text-sky-700">Procedures</h2><ul className="mt-3 list-disc space-y-2 pl-5 leading-6 text-slate-600"><li>Diagnostic endoscopy and colonoscopy</li><li>Therapeutic endoscopy and colonoscopy, including EVL, polypectomy, bleeding treatment, stricture dilation and APC</li><li>Therapeutic ERCP</li><li>Diagnostic and therapeutic EUS</li><li>Cholangioscopy and laser lithotripsy</li></ul></article>
      </section>
      <section className="mx-auto mt-8 grid w-[min(1100px,calc(100%-2rem))] gap-5 md:grid-cols-2">
        {clinicLocations.map((location) => <article key={location.id} className="rounded-2xl border border-sky-100 bg-white p-7 shadow-sm"><h2 className="text-sm font-bold uppercase tracking-wider text-sky-700">{location.name}</h2><p className="mt-3 font-semibold text-[#173f76]">{location.hours.join(' · ')}</p><p className="mt-2 text-sm leading-6 text-slate-600">{location.address}</p><p className="mt-2 text-sm leading-6 text-slate-600">{location.services}</p></article>)}
        <p className="text-sm leading-6 text-slate-600 md:col-span-2">Sunday is listed as closed on the supplied clinic profile. Please confirm before visiting.</p>
      </section>
      <section className="mx-auto mt-12 w-[min(1100px,calc(100%-2rem))] rounded-3xl bg-[#173f76] px-7 py-10 text-white md:px-12">
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-sky-200">Sood Clinic</p>
        <h2 className="mt-3 text-3xl font-extrabold">Specialist gastroenterology care in Panchkula.</h2>
        <p className="mt-4 max-w-3xl leading-8 text-sky-50">Consultations are available at Dhawan Hospital and Jindal Diagnostics. Dhawan Hospital offers OPD consultations and procedures; Jindal Diagnostics is for OPD consultations only. Video consultations are also available by request.</p>
      </section>
    </main>
    <Footer />
    </>

  );
};

export default About;
