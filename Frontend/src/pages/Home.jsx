import Navbar from '../components/Navbar';
import NoticeSlider from '../components/Slider';
import Footer from '../components/Footer';
import { Link } from 'react-router-dom';
import { doctorName } from '../lib/clinicLocations';

const Home = () => (
  <>
    <Navbar />
    <main>
      <NoticeSlider />
      <section className="home-feature-strip" aria-label="Sood Clinic benefits">
        {[['Gastroenterology care', `Consultations with ${doctorName}`], ['Choose your visit', 'In-person and video consultation options'], ['Plan your visit', 'Request an appointment online'], ['Stay informed', 'Practical digestive-health guides']].map(([title, detail]) => <article key={title} className="home-feature"><div><h2>{title}</h2><p>{detail}</p></div></article>)}
      </section>
      <section className="container mx-auto my-12 max-w-4xl px-5 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-700">Sood Clinic, Panchkula</p>
        <h1 className="mt-3 text-3xl font-semibold md:text-5xl">{doctorName}</h1>
        <p className="mt-3 text-lg text-slate-600">Gastroenterology consultations and follow-up care</p>
        <div className="mx-auto mt-7 max-w-xl rounded-2xl border bg-white p-6 text-center shadow-sm">
          <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.16em] text-sky-700">Care that starts with a clear conversation</p>
          <p className="leading-7 text-slate-600">Book an appointment, review clinic information, or explore health guides before your visit. Video consultations are available where clinically appropriate.</p>
        </div>
      </section>
      <section className="home-guides-callout" aria-label="Patient education">
        <div><p>CLINIC EDUCATION</p><h2>Understand your digestive health.</h2><span>Short, evidence-informed guides to help you prepare for a conversation with your clinician.</span></div>
        <Link to="/guides">Explore health guides</Link>
      </section>
    </main>
    <Footer />
  </>
);

export default Home;
