



// Sample data for the items
const items = [
  {
    title: 'Professional',
    description: 'Our clinic is staffed with highly qualified professionals...',
    color: '#FF007F',
    Icon: () => (
      // Example SVG for Professional
      <img width="48" height="48" src="https://img.icons8.com/external-smashingstocks-thin-outline-color-smashing-stocks/67/external-Hand-Holding-Heart-healthcare-smashingstocks-thin-outline-color-smashing-stocks.png" alt="external-Hand-Holding-Heart-healthcare-smashingstocks-thin-outline-color-smashing-stocks" />
    ),
  },
  {
    title: 'Qualified',
    description: 'Highly qualified doctors and nurses...',
    color: '#FFA500',
    Icon: () => (
      <img width="48" height="48" src="https://img.icons8.com/fluency/48/worker-male.png" alt="worker-male" />
    ),
  },
  {
    title: 'Emergency',
    description: 'Specialized treatments, we offer ...',
    color: '#000000',
    Icon: () => (
      // SVG for Emergency (ambulance icon)
      <img width="48" height="48" src="https://img.icons8.com/fluency/48/ambulance.png" alt="ambulance" />
    ),
  },
  {
    title: 'Available 24/7',
    description: 'Regular check-ups to monitor your child\'s...',
    color: '#FF007F',
    Icon: () => (
      // SVG for Available 24/7 (clock icon)
<img width="48" height="48" src="https://img.icons8.com/color/48/people-working-together.png" alt="people-working-together"/>
    ),
  },
];

const ServiceCard = ({ title, description, color, Icon }) => (
  <div style={{ maxWidth: '190px', margin: '10px' } } className=''>
    <div style={{ color, fontSize: '40px' }}>
      <Icon />
    </div>
    <div>

    <h3 className='text-3xl' >{title}</h3>
    <p>{description}</p>
    </div>
  </div>
);

const ServicesSection = () => (
  <div style={{ display: 'flex', justifyContent: 'space-around', padding: '20px' }} className=' flex-wrap'>
    {items.map((item, index) => (
      <ServiceCard
        key={index}
        title={item.title}
        description={item.description}
        color={item.color}
        Icon={item.Icon}
      />
    ))}
  </div>
);






const reviews = [

  {
    name: "Camila J.",
    text: "Lorem ipsum dolor sit amet consectetur adipisicing elit. Modi corrupti et velit reprehenderit deserunt pariatur incidunt commodi vitae, recusandae animi libero natus, doloribus iusto ipsa vel non ratione repellat eum!",
    rating: 5
  },
  {
    name: "Audrey M.",
    text: "Lorem ipsum dolor sit amet consectetur adipisicing elit. Modi corrupti et velit reprehenderit deserunt pariatur incidunt commodi vitae, recusandae animi libero natus, doloribus iusto ipsa vel non ratione repellat eum!",
    rating: 5
  },
  {
    name: "Isabel K.",
    text: "Lorem ipsum dolor sit amet consectetur adipisicing elit. Modi corrupti et velit reprehenderit deserunt pariatur incidunt commodi vitae, recusandae animi libero natus, doloribus iusto ipsa vel non ratione repellat eum!",
    rating: 1
  },
  {
    name: "David L.",
    text: "Lorem ipsum dolor sit amet consectetur adipisicing elit. Modi corrupti et velit reprehenderit deserunt pariatur incidunt commodi vitae, recusandae animi libero natus, doloribus iusto ipsa vel non ratione repellat eum!",
    rating: 5
  },
  {
    name: "Amir R.",
    text: "Lorem ipsum dolor sit amet consectetur adipisicing elit. Modi corrupti et velit reprehenderit deserunt pariatur incidunt commodi vitae, recusandae animi libero natus, doloribus iusto ipsa vel non ratione repellat eum!",
    rating: 4
  },
  {
    name: "Emma T.",
    text: "Lorem ipsum dolor sit amet consectetur adipisicing elit. Modi corrupti et velit reprehenderit deserunt pariatur incidunt commodi vitae, recusandae animi libero natus, doloribus iusto ipsa vel non ratione repellat eum!",
    rating: 5
  }


];

const ReviewSection = () => {
  // Function to generate star rating
  const renderStars = (rating) => {
    return [...Array(5)].map((star, i) => (
      <span key={i} className={`star ${i < rating ? "filled" : ""}`}>⭐</span>
    ));
  };

  return (
    <div className="    p-6">
      <h1 className="text-2xl md:text-4xl lg:text-5xl font-semibold text-center mb-8 ">Customer Testimonials</h1>

      <div className='grid md:grid-cols-2   grid-cols-1 lg:grid-cols-3'>

        {reviews.map((review, index) => (
          <div key={index} className="review-item p-4  my-4   border-gray-200 text-center">
            <p className="text-lg  italic  ">"{review.text}"</p>
            <div className="flex justify-center items-center mt-4">
              {renderStars(review.rating)}
            </div>
            <p className="text-lg font-semibold mt-2">- {review.name}</p>
          </div>
        ))}
      </div>
    </div>
  );
};



// Replace with the actual image URL

const ContactForm = () => {
  return (
    <div>

    </div>
  );
};








// const Rev = () => {
//   return (
//     <div className="h-auto  py-3 mb-2  bg-gray-100 w-full  ">
//       <Marquee speed={60} pauseOnHover={true} className="text-white h-full py-4 text-md">



//         {Items.map((item, index) => (
//           <span
//             key={index}
//             className="mx-4 px-4 py-3 bg-[#00b2c8] cursor-pointer hover:bg-[#228d9b] text-white rounded-full shadow-md whitespace-nowrap"
//           >
//             {item}
//           </span>
//         ))}

//       </Marquee>


//     </div>
//   );
// };

// const Revimage = () => {
//   return (
//     <div className="h-auto  py-1 my-9  bg-white w-full  ">
//       <h2 className='w-full text-center text-4xl font-semibold  text-black my-2 '>Unlimited Entertainment to Watch</h2>
//       <Marquee speed={30} direction='right' className="text-white h-full py-4 mt-8 text-md">



//         {Images.map((item, index) => (
//           <div className='bg-transparent rounded-xl w-[180px]  mx-5  flex justify-center items-center h-[160px]'>

//             <img
//               key={index}
//               src={item}
//               className="mx-4 w-full hover:shadow-2xl hover:shadow-black cursor-pointer h-full p-1 object-fit   "


//             />
//           </div>
//         ))}

//       </Marquee>


//     </div>
//   );
// };

import { useState, useEffect } from 'react';

// const Slideshow = () => {
//   // Array of image URLs
//   const images = [
//     g1,
//     g2,

//     g3,
//     g4,
//     g5,
//     g6,
//     "https://www.baltana.com/files/wallpapers-26/KGF-Chapter-2-Yash-HD-Desktop-Wallpaper-72159.jpg",
//     "https://wallpapercave.com/wp/wp4092812.jpg",
//     "https://images.alphacoders.com/107/1072652.jpg",
//     "https://i.ytimg.com/vi/n39Ey7Yrv_k/maxresdefault.jpg",
//     "https://images5.alphacoders.com/119/thumb-1920-1195470.jpg",
//     "http://www.pixelstalk.net/wp-content/uploads/2016/04/Kung-Fu-Panda-HD-Wallpapers-Movie.jpg",
//     "https://wallpapercave.com/wp/wp3723778.jpg",
//     "https://images4.alphacoders.com/113/thumb-1920-1134176.jpg"
//   ];

//   const [currentIndex, setCurrentIndex] = useState(0); // Tracks the current image index


//   const nextSlide = () => {
//     setCurrentIndex((prevIndex) => (prevIndex + 1) % images.length);
//   };


//   useEffect(() => {
//     const interval = setInterval(() => {
//       nextSlide();
//     }, 3000); 
//     return () => clearInterval(interval); 
//   }, []); 

//   return (
//     <div className="h-[90vh] text-center w-full   my-24 ">
//       <h1 className='text-4xl font-semibold my-2'>Non Stop Entertainment</h1>
//       <img
//         src={images[currentIndex]}
//         alt={`Slide ${currentIndex + 1}`}
//         className="w-full h-full object-cover transition-opacity duration-500"
//       />


//     </div>
//   );
// };

// Replace with actual SVG paths or import SVG components if available
const MailIcon = () => 
<img width="48" height="48" src="https://img.icons8.com/3d-fluency/94/mail.png" alt="mail"/>


const PhoneIcon = () => (
<img width="48" height="48" src="https://img.icons8.com/neon/96/ringer-volume.png" alt="ringer-volume"/>
);

const LocationIcon = () => (
<img width="48" height="48" src="https://img.icons8.com/fluency/48/location--v1.png" alt="location--v1"/>
);

const Card = ({ icon: Icon, title, description, contactInfo }) => (
  <div className="relative flex flex-col justify-between w-auto flex-grow gap-5 p-6  rounded-xl shadow-md  hover:shadow-lg transition-shadow">
    <div className="flex items-center space-x-3">
      <Icon />
      <h2 className="text-xl font-semibold">{title}</h2>
    </div>
    <hr className="my-3 border-t border-gray-300" />
    <p className="mt-2 text-sm text-gray-400  ">{contactInfo}</p>
    <button className="absolute bottom-4 right-4 p-2 bg-orange-100 rounded-full text-orange-500 hover:bg-orange-200 transition-colors">
      <span className="transform rotate-45">✈️</span>
    </button>
  </div>
);

const ContactCards = () => {
  return (
    <div className="flex  flex-wrap  gap-6 p-8 ">
      <Card
        icon={MailIcon}
        title="Mail us 24/7"
        contactInfo="info@HealthCare.pk"
      />
      <Card
        icon={PhoneIcon}
        title="Call us 24/7"
        contactInfo="Phone: +92-333-4252711"
      />
      <Card
        icon={LocationIcon}
        title="Our Locations"
        contactInfo="13-CC, Commercial Area Phase-4, DHA, Lahore, Pakistan"
      />
    </div>
  );
};




export { ReviewSection, ServicesSection , ContactCards,ContactForm};
