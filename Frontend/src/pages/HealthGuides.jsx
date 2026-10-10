import { Link } from 'react-router-dom';
import Footer from '../components/Footer';
import Navbar from '../components/Navbar';

const guides = [
  {
    title: 'Pancreatitis: the essentials',
    category: 'Pancreas',
    summary: 'An introduction to inflammation of the pancreas, the difference between acute and chronic illness, and why medical assessment matters.',
    points: ['Acute pancreatitis is a sudden illness; chronic pancreatitis is long-lasting and can cause permanent damage.', 'Upper abdominal pain, nausea, vomiting, fever, rapid pulse, jaundice, or shortness of breath need urgent medical assessment.', 'Diagnosis and treatment depend on the person and may involve history, examination, lab tests, imaging, and hospital care.'],
    source: 'https://www.niddk.nih.gov/health-information/digestive-diseases/pancreatitis',
  },
  {
    title: 'Digestive symptoms: preparing for a visit',
    category: 'Digestive health',
    summary: 'A simple checklist to help make a clinic conversation more useful when symptoms affect your digestion.',
    points: ['Note when symptoms started, what makes them better or worse, and any change in appetite, bowel habits, or weight.', 'Bring a current medicine list, including over-the-counter products and supplements.', 'A clinician decides which tests, if any, are appropriate after discussing your symptoms and medical history.'],
    source: 'https://www.niddk.nih.gov/health-information/digestive-diseases',
  },
  {
    title: 'Understanding tests and next steps',
    category: 'Care planning',
    summary: 'Why clinicians may combine a conversation, examination, laboratory tests, and imaging to understand digestive concerns.',
    points: ['Tests answer specific clinical questions; not every symptom needs the same investigation.', 'Ask what a test is for, how to prepare, and when you should expect results.', 'Keep follow-up appointments so results can be interpreted in the context of your full health picture.'],
    source: 'https://www.niddk.nih.gov/health-information/digestive-diseases/pancreatitis/diagnosis',
  },
];

const HealthGuides = () => <><Navbar /><main className="health-guides"><header className="health-guides__hero"><p>SOOD CLINIC EDUCATION</p><h1>Clear information for better conversations.</h1><span>Practical digestive-health explainers to help you prepare for care—not to replace an assessment by a qualified clinician.</span><div><Link to="/book">Book a consultation</Link><a href="#guides">Explore guides</a></div></header><section id="guides" className="health-guides__grid" aria-label="Patient education guides">{guides.map((guide) => <article key={guide.title}><header><p>{guide.category}</p><h2>{guide.title}</h2><span>{guide.summary}</span></header><ul>{guide.points.map((point) => <li key={point}>{point}</li>)}</ul><a href={guide.source} target="_blank" rel="noreferrer">Read the referenced health information <span aria-hidden="true">↗</span></a></article>)}</section><aside className="health-guides__safety"><div><p>WHEN TO SEEK URGENT CARE</p><h2>Severe or worsening abdominal pain should not wait for an online guide.</h2><span>Seek urgent medical help for severe pain, persistent vomiting, fever or chills, jaundice, breathing difficulty, fainting, or any symptom that feels like an emergency.</span></div><Link to="/contact">Clinic contact details</Link></aside><section className="health-guides__note"><h2>About these guides</h2><p>These short summaries are for general education. They do not diagnose a condition, recommend treatment, or replace advice from your own clinician. Source links lead to patient information reviewed by the U.S. National Institute of Diabetes and Digestive and Kidney Diseases.</p></section></main><Footer /></>;

export default HealthGuides;
