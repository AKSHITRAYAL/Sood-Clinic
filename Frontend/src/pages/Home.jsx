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
