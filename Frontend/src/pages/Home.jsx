import Navbar from '../components/Navbar';
import NoticeSlider from '../components/Slider';
import { ServicesSection } from '../components/rev';
import Footer from '../components/Footer';
import SoodClinicMark from '../components/SoodClinicMark';

const Home = () => (
  <>
    <Navbar />
    <main>
      <NoticeSlider />
      <section className="relative z-10 mx-auto -mt-10 grid w-[min(1120px,calc(100%-2rem))] grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-100 bg-slate-100 shadow-xl md:grid-cols-4">
        {[['Specialist care', 'Gastroenterology expertise'], ['Flexible consultations', 'In-clinic & video visits'], ['Convenient hours', 'Monday to Saturday'], ['Patient-first', 'Clear, personal support']].map(([title, detail]) => <div key={title} className="bg-white px-5 py-6"><p className="font-bold text-[#173f76]">{title}</p><p className="mt-1 text-sm text-slate-500">{detail}</p></div>)}
      </section>
      <ServicesSection />
      <section className="container mx-auto my-12 max-w-4xl px-5 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Sood Clinic leadership</p>
        <h1 className="mt-3 text-3xl font-semibold md:text-5xl">Dr. Brig. A. K. Sood VSM (Retd)</h1>
        <p className="mt-3 text-lg text-slate-600">Clinic Owner · Gastroenterologist</p>
        <div className="mx-auto mt-7 flex max-w-xl flex-col items-center gap-5 rounded-2xl border bg-white p-6 shadow-sm sm:flex-row sm:text-left">
          <span className="shrink-0"><SoodClinicMark /></span>
          <p className="leading-7 text-slate-600">Gastroenterology care at Sood Clinic, Panchkula. Dr. Sood has over 38 years of clinical experience and offers in-clinic visits and video consultations.</p>
        </div>
      </section>
    </main>
    <Footer />
  </>
);

export default Home;
