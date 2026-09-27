import { Link } from 'react-router-dom';

const DoctorCards = ({ notices = [] }) => {
  if (!notices.length) return <p className="text-center text-gray-500 my-10">Doctor profiles will appear here once they are added by the clinic administrator.</p>;
  return <section className="w-[95%] px-5 py-10 mx-auto"><div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{notices.map((doctor) => <article key={doctor._id} className="overflow-hidden rounded-lg border-2 dark:border-gray-400"><img className="h-60 w-full object-cover" src={doctor.image ? `http://localhost:3001/uploads/${doctor.image}` : 'https://dummyimage.com/720x480/e5e7eb/4b5563&text=Doctor'} alt={`Dr. ${doctor.name}`} /><div className="p-6"><h2 className="title-font text-lg font-medium mb-3">Dr. {doctor.name}</h2><p className="leading-relaxed mb-4">Specialization: {doctor.spcialization || 'Not specified'}</p><Link to="/Booknow" className="text-indigo-500 inline-flex items-center font-medium">Book appointment <span aria-hidden="true">→</span></Link></div></article>)}</div></section>;
};

export default DoctorCards;
