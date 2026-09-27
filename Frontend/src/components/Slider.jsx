import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const notices = [
  { id: 1, image: 'https://images.pexels.com/photos/7089010/pexels-photo-7089010.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1', title: 'Thoughtful care, close to home' },
  { id: 2, image: 'https://images.pexels.com/photos/4269204/pexels-photo-4269204.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1', title: 'Care led by Brig. A. K. Sood' },
  { id: 3, image: 'https://images.unsplash.com/photo-1601841197690-6f0838bdb005?q=80&w=1470&auto=format&fit=crop', title: 'Simple appointments. Personal attention.' },
];

const NoticeSlider = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setActiveIndex((current) => (current + 1) % notices.length), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const notice = notices[activeIndex];
  return (
    <section className="notice-carousel" aria-label="Hospital highlights">
      <img src={notice.image} alt="" className="notice-carousel__image" />
      <div className="notice-carousel__overlay">
        <p>Sood Clinic</p>
        <h1>{notice.title}</h1>
        <Link to="/Booknow" className="hero-appointment-button"><span aria-hidden="true">+</span> Book appointment</Link>
      </div>
      <div className="notice-carousel__dots" role="tablist" aria-label="Hospital highlights">
        {notices.map((item, index) => <button key={item.id} type="button" aria-label={`Show highlight ${index + 1}`} aria-selected={activeIndex === index} className={activeIndex === index ? 'active' : ''} onClick={() => setActiveIndex(index)} />)}
      </div>
    </section>
  );
};

export default NoticeSlider;
