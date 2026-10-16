import { useMemo, useState } from 'react';
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

const videos = [
  { title: 'Acidity', category: 'Digestive health', file: 'acidity.mp4' },
  { title: 'Gastric cancer', category: 'Stomach health', file: 'gastric-cancer.mp4' },
  { title: 'Gastric problems', category: 'Stomach health', file: 'gastric-problems.mp4' },
  { title: 'Constipation (Kabziyat)', category: 'Digestive health', file: 'constipation-kabziyat.mp4' },
  { title: 'Liver cirrhosis', category: 'Liver health', file: 'liver-cirrhosis.mp4' },
  { title: 'Pancreatic problems', category: 'Pancreas', file: 'pancreatic-problems.mp4' },
  { title: 'Abdominal burning (Pet jalan)', category: 'Digestive health', file: 'abdominal-burning-pet-jalan.mp4' },
];

const HealthGuides = () => {
  const [query, setQuery] = useState('');
  const [contentType, setContentType] = useState('all');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleGuides = useMemo(() => guides.filter((guide) => `${guide.title} ${guide.category} ${guide.summary}`.toLocaleLowerCase().includes(normalizedQuery)), [normalizedQuery]);
  const visibleVideos = useMemo(() => videos.filter((video) => `${video.title} ${video.category}`.toLocaleLowerCase().includes(normalizedQuery)), [normalizedQuery]);

  return <><Navbar /><main className="health-guides">
    <header className="health-guides__hero">
      <p>SOOD CLINIC EDUCATION</p>
      <h1>Digestive health, explained clearly.</h1>
      <span>Browse articles and video explainers from Dr. Sood. These resources support informed conversations with your clinician; they do not replace personal medical advice.</span>
      <div><Link to="/book">Book a consultation</Link><a href="#video-guides">Watch videos</a><a href="#articles">Read articles</a></div>
    </header>

    <section className="health-guides__browse" aria-label="Find health guides">
      <label htmlFor="guide-search">Search topics</label>
      <input id="guide-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try acidity, liver, or pancreas" />
      <div role="group" aria-label="Filter guide type">
        {[['all', 'All resources'], ['videos', 'Videos'], ['articles', 'Articles']].map(([value, label]) => <button key={value} type="button" aria-pressed={contentType === value} className={contentType === value ? 'is-active' : ''} onClick={() => setContentType(value)}>{label}</button>)}
      </div>
    </section>

    {contentType !== 'articles' && <section id="video-guides" className="health-guides__videos" aria-labelledby="video-guides-title">
      <header className="health-guides__section-heading"><div><p>WATCH</p><h2 id="video-guides-title">Dr. Sood explains</h2></div><span>{visibleVideos.length} videos</span></header>
      {visibleVideos.length ? <div className="health-guides__video-grid">{visibleVideos.map((video) => <article className="health-guides__video-card" key={video.file}>
        <video controls preload="metadata" playsInline aria-label={`${video.title}, explained by Dr. Sood`}>
          <source src={`/health-guides/videos/${video.file}`} type="video/mp4" />
          Your browser does not support embedded video. <a href={`/health-guides/videos/${video.file}`}>Open the video</a>.
        </video>
        <div><p>{video.category}</p><h3>{video.title}</h3><span>Video explanation by Dr. Sood</span></div>
      </article>)}</div> : <p className="health-guides__empty">No videos match this search.</p>}
    </section>}

    {contentType !== 'videos' && <section id="articles" aria-label="Patient education articles">
      <header className="health-guides__section-heading"><div><p>READ</p><h2>Articles and checklists</h2></div><span>{visibleGuides.length} articles</span></header>
      {visibleGuides.length ? <div className="health-guides__grid">{visibleGuides.map((guide) => <article key={guide.title}><header><p>{guide.category}</p><h3>{guide.title}</h3><span>{guide.summary}</span></header><ul>{guide.points.map((point) => <li key={point}>{point}</li>)}</ul><a href={guide.source} target="_blank" rel="noreferrer">Read referenced health information <span aria-hidden="true">↗</span></a></article>)}</div> : <p className="health-guides__empty">No articles match this search.</p>}
    </section>}

    <aside className="health-guides__safety"><div><p>WHEN TO SEEK URGENT CARE</p><h2>Severe or worsening abdominal pain should not wait for an online guide.</h2><span>Seek urgent medical help for severe pain, persistent vomiting, fever or chills, jaundice, breathing difficulty, fainting, or any symptom that feels like an emergency.</span></div><Link to="/contact">Clinic contact details</Link></aside>
    <section className="health-guides__note"><h2>About these guides</h2><p>Articles and videos are for general education. They do not diagnose a condition, recommend treatment, or replace advice from your own clinician. Article source links lead to patient information reviewed by the U.S. National Institute of Diabetes and Digestive and Kidney Diseases.</p></section>
  </main><Footer /></>;
};

export default HealthGuides;
