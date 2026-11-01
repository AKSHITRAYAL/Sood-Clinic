import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import drAkSoodProfile from '../assets/brand/dr-ak-sood-portrait.jpeg';
import { clinicLocations, doctorName } from '../lib/clinicLocations';
import { Link } from 'react-router-dom';

const qualifications = [
  'MBBS · AFMC, Pune',
  'MD (Medicine) · AFMC, Pune',
  'DNB · NBE',
  'DM (Gastroenterology) · PGIMER, Chandigarh',
  'MNAMS',
];

const careerHighlights = [
  {
    title: 'Academic and military appointments',
    description:
      'Professor of Medicine and Gastroenterology at Army Hospital (R&R), New Delhi; service at Command Hospital (Western Command); senior residency at PGIMER, Chandigarh.',
  },
  {
    title: 'Consultant and leadership appointments',
    appointments: [
      {
        title: 'Director & Head of Department (HOD), Gastroenterology',
        institution:
          'Sarvodaya Hospital & Research Centre, Sector 8, Faridabad',
      },
      {
        title: 'Director & Chairman, Department of Gastroenterology',
        institution:
          'Yashoda Hospital & Research Centre, Nehru Nagar, Ghaziabad',
      },
    ],
    description:
      'Director of AORTA (Army Organ Retrieval and Transplant Authority).',
  },
  {
    title: 'Public service',
    description:
      'Deputation to the Government of Sikkim and former personal physician to the Governor of Sikkim.',
  },
];

const expertise = [
  'Irritable Bowel Syndrome',
  'Inflammatory Bowel Disease',
  'Chronic Hepatitis B',
  'Chronic Hepatitis C',
  'Alcoholic Liver Disease',
  'Cirrhosis of the Liver',
  'Metabolic Fatty Liver Disease',
  'CBD Stones',
  'Gallbladder and pancreatic carcinoma with obstructive jaundice',
  'Chronic Pancreatitis',
];

const procedureGroups = [
  {
    title: 'Diagnostic endoscopy',
    items: [
      'Endoscopy',
      'Colonoscopy',
      'Diagnostic EUS with FNA/FNB',
      'Single Balloon Enteroscopy',
      'Double Balloon Enteroscopy',
      'Capsule Endoscopy',
    ],
  },
  {
    title: 'Therapeutic endoscopy',
    items: [
      'Foreign Body Removal',
      'Stricture Dilatation',
      'Esophageal Variceal Banding',
      'Polypectomy',
      'Argon Plasma Coagulation (APC)',
      'Glue Therapy',
      'Endoscopic Hemoclip Placement',
      'Metal Stenting',
      'Sclerotherapy',
      'Endoscopic Mucosal Resection (EMR)',
    ],
  },
  {
    title: 'Biliary and pancreatic interventions',
    items: [
      'Endoscopic Sphincterotomy',
      'CBD Stricture Dilatation',
      'CBD Stone Extraction',
      'Biliary Stenting (Metal/Plastic)',
      'Mechanical Lithotripsy',
      'Cholangioscopy with Laser Lithotripsy',
      'Endoscopic Cystogastrostomy',
    ],
  },
  {
    title: 'EUS-guided interventions',
    items: [
      'EUS-guided Choledochoduodenostomy',
      'EUS-guided Gastrojejunostomy',
      'EUS-guided Hepaticogastrostomy',
      'EUS-guided Coiling and Glue Therapy',
    ],
  },
];

const About = () => (
  <>
    <Navbar />

    <main className="bg-[#f7fbff] text-slate-600">

      {/* 1. Doctor introduction */}
      <section className="bg-gradient-to-b from-white to-[#f7fbff]">
        <div className="mx-auto grid w-[min(1120px,calc(100%-2rem))] items-center gap-10 py-12 md:grid-cols-[.85fr_1.15fr] md:gap-16 md:py-20">

          <figure className="relative mx-auto w-full max-w-[390px] overflow-hidden rounded-[1.5rem] bg-[#e5f0fa] shadow-[0_24px_60px_rgba(23,63,118,.14)]">
            <img
              src={drAkSoodProfile}
              alt={doctorName}
              className="block aspect-[3/4] w-full object-cover object-[50%_30%]"
            />

            <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#102f59]/95 via-[#102f59]/65 to-transparent px-6 pb-6 pt-20 text-white">
              <span className="block text-xs font-bold uppercase tracking-[.16em] text-sky-100">
                Chief Consultant
              </span>
              <strong className="mt-1 block text-xl">
                Gastroenterology &amp; Hepatology
              </strong>
            </figcaption>
          </figure>

          <div className="max-w-2xl">
            <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.18em] text-sky-700">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-600" />
              Meet your consultant
            </p>

            <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-[-.045em] text-[#173f76] md:text-5xl lg:text-[3.5rem]">
              {doctorName}
            </h1>

            <p className="mt-3 text-sm font-semibold tracking-wide text-[#52749a]">
              Sood Clinic · Panchkula, Haryana
            </p>

            <div className="mt-7 h-px w-16 bg-sky-600" />

            <p className="mt-7 text-base leading-8 text-slate-600 md:text-[17px]">
              Brig (Dr) Atul Kumar Sood VSM (Retd.) has returned to
              Panchkula, Haryana, after practising in Faridabad and
              Ghaziabad as Chief Consultant in Gastroenterology and
              Hepatology. He has been trained in pediatric and adult upper
              and lower endoscopic interventions, including pancreaticobiliary
              and therapeutic endoscopic ultrasound interventions. He has
              also received training in organ donation and liver
              transplantation.
            </p>

            <p className="mt-4 text-base leading-8 text-slate-600 md:text-[17px]">
              He has been a teacher, guide and examiner for both General
              Medicine and Gastroenterology for more than 30 years. He is
              a member of the National Academy of Medical Sciences, Indian
              Society of Gastroenterology, Indian National Association for
              the Study of Liver Diseases, and Society of Gastrointestinal
              Interventions. He has also served as a reviewer for medical
              journals.
            </p>

            <div className="mt-8">
              <Link
                to="/book"
                className="inline-flex min-h-12 items-center justify-center rounded-lg bg-[#176dcc] px-6 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#0f5bad] hover:shadow-md"
              >
                Request an appointment
                <span className="ml-2" aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Professional qualifications */}
      <section className="mx-auto w-[min(1120px,calc(100%-2rem))] py-10 md:py-14">
        <div className="rounded-2xl border border-[#dce8f5] bg-white p-6 shadow-[0_8px_30px_rgba(23,63,118,.04)] md:p-9">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[.16em] text-sky-700">
                Education &amp; training
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[#173f76] md:text-3xl">
                Professional qualifications
              </h2>
            </div>

            <p className="text-sm text-slate-500">
              Medicine · Gastroenterology
            </p>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            {qualifications.map((qualification) => (
              <span
                key={qualification}
                className="rounded-lg border border-[#dce8f5] bg-[#f7fbff] px-4 py-3 text-sm font-semibold text-[#31557d]"
              >
                {qualification}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Career and experience */}
      <section className="border-y border-[#e2edf7] bg-white py-14 md:py-20">
        <div className="mx-auto w-[min(1120px,calc(100%-2rem))]">

          <div className="max-w-2xl">
            <p className="text-xs font-extrabold uppercase tracking-[.16em] text-sky-700">
              Professional journey
            </p>

            <h2 className="mt-3 text-3xl font-semibold tracking-[-.035em] text-[#173f76] md:text-4xl">
              A career across care, teaching and service
            </h2>

            <p className="mt-4 text-base leading-7 text-slate-500">
              His professional journey spans specialist medical practice,
              academic leadership and public service.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {careerHighlights.map((item, index) => (
              <article
                key={item.title}
                className="rounded-xl border border-[#dce8f5] bg-[#f9fcff] p-6"
              >
                <span className="text-sm font-bold tracking-wider text-sky-700">
                  0{index + 1}
                </span>

                <h3 className="mt-4 text-lg font-bold leading-snug text-[#173f76]">
                  {item.title}
                </h3>

                {item.appointments && (
                  <div className="mt-4 space-y-4">
                    {item.appointments.map((appointment) => (
                      <div
                        key={appointment.institution}
                        className="border-l-2 border-sky-600 pl-4"
                      >
                        <p className="text-sm font-bold leading-6 text-[#31557d]">
                          {appointment.title}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">
                          {appointment.institution}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {item.description && (
                  <p className="mt-4 text-sm leading-7 text-slate-600">
                    {item.description}
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 4. Clinical expertise and specialist procedures */}
      <section className="py-14 md:py-20">
        <div className="mx-auto w-[min(1120px,calc(100%-2rem))]">

          <div className="max-w-2xl">
            <p className="text-xs font-extrabold uppercase tracking-[.16em] text-sky-700">
              Specialisation
            </p>

            <h2 className="mt-3 text-3xl font-semibold tracking-[-.035em] text-[#173f76] md:text-4xl">
              Clinical expertise
            </h2>

            <p className="mt-4 text-base leading-7 text-slate-500">
              Areas of expertise and specialist diagnostic and therapeutic
              procedures in Gastroenterology and Hepatology.
            </p>
          </div>

          <div className="mt-9 grid items-start gap-6 lg:grid-cols-[1fr_1fr]">

            {/* Areas of expertise */}
            <article className="rounded-2xl border border-[#dce8f5] bg-white p-6 shadow-[0_8px_30px_rgba(23,63,118,.04)] md:p-8">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[.16em] text-sky-700">
                  Conditions treated
                </p>
                <h3 className="mt-2 text-xl font-bold text-[#173f76]">
                  Areas of expertise
                </h3>
              </div>

              <ul className="mt-6 grid gap-x-6 sm:grid-cols-2">
                {expertise.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 border-b border-[#edf2f8] py-3 text-sm leading-6 text-slate-600"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-600"
                    />
                    {item}
                  </li>
                ))}
              </ul>
            </article>

            {/* Scrollable specialist procedures */}
            <article className="overflow-hidden rounded-2xl border border-[#d5e5f4] bg-[#eaf3fc] p-6 md:p-8">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[.16em] text-sky-700">
          Diagnostic &        Diagnostic &amp; therapeutic care
                </p>

                <h3 className="mt-2 text-xl font-bold text-[#173f76]">
                  Specialist procedures
                </h3>

                <p className="mt-2 text-sm leading-6 text-slate-500">
                  A range of advanced endoscopic and EUS-guided procedures.
                </p>

                <p className="mt-3 text-xs font-semibold text-[#52749a]">
                  {procedureGroups.reduce(
                    (total, group) => total + group.items.length,
                    0
                  )}{' '}
                  procedures · Scroll to view the complete list
                </p>
              </div>

              <div
                tabIndex={0}
                role="region"
                aria-label="Scrollable list of specialist procedures"
                className="mt-6 max-h-[390px] overflow-y-auto overscroll-y-auto rounded-xl border border-[#dce8f5] bg-white px-4 py-2 pr-3 focus:outline-none focus:ring-2 focus:ring-sky-600 md:max-h-[450px]"
              >
                {procedureGroups.map((group, groupIndex) => (
                  <div
                    key={group.title}
                    className="py-4"
                  >
                    <h4 className="sticky top-0 z-10 -mx-1 bg-white px-1 py-2 text-xs font-extrabold uppercase tracking-[.12em] text-sky-700">
                      {group.title}
                    </h4>

                    <ul className="mt-1">
                      {group.items.map((procedure) => (
                        <li
                          key={procedure}
                          className="flex items-start gap-3 border-b border-[#edf2f8] py-3 text-sm leading-6 text-[#31557d] last:border-0"
                        >
                          <span
                            aria-hidden="true"
                            className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-600"
                          />
                          {procedure}
                        </li>
                      ))}
                    </ul>

                    {groupIndex !== procedureGroups.length - 1 && (
                      <div className="mt-4 border-b border-[#dce8f5]" />
                    )}
                  </div>
                ))}
              </div>
            </article>
          </div>
        </div>
      </section>

      {/* 5. Clinic locations */}
      <section className="border-t border-[#e2edf7] bg-white py-14 md:py-20">
        <div className="mx-auto w-[min(1120px,calc(100%-2rem))]">

          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[.16em] text-sky-700">
                Visit us
              </p>

              <h2 className="mt-3 text-3xl font-semibold tracking-[-.035em] text-[#173f76] md:text-4xl">
                Consultation locations
              </h2>

              <p className="mt-3 text-base leading-7 text-slate-500">
                Find a convenient location for your consultation.
              </p>
            </div>

            <span className="text-sm text-slate-500">
              Sunday closed · Confirm timings before visiting.
            </span>
          </div>

          <div className="mt-9 grid gap-5 md:grid-cols-2">
            {clinicLocations.map((location) => (
              <article
                key={location.id}
                className="rounded-2xl border border-[#dce8f5] bg-[#f9fcff] p-6 md:p-8"
              >
                <h3 className="text-xl font-bold text-[#173f76]">
                  {location.name}
                </h3>

                <div className="mt-5 border-t border-[#e2edf7] pt-5">
                  <p className="text-sm leading-7 text-slate-600">
                    {location.address}
                  </p>

                  <p className="mt-4 text-sm font-semibold leading-6 text-[#31557d]">
                    {location.hours.join(' · ')}
                  </p>

                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    {location.services}
                  </p>
                </div>

                <a
                  className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#176dcc] transition hover:text-[#0f5bad]"
                  href={location.directions}
                  target="_blank"
                  rel="noreferrer"
                >
                  Get directions
                  <span aria-hidden="true">↗</span>
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

    </main>

    <Footer />
  </>
);

export default About;