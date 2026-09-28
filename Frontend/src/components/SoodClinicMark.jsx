import originalSoodLogo from '../assets/brand/AK_Sood_Logo.png';

const SoodClinicMark = () => (
  <span className="brand-logo" aria-label="Sood Clinic">
    <span className="brand-logo__crop">
      <img src={originalSoodLogo} alt="Sood Clinic logo" />
    </span>
  </span>
);

export default SoodClinicMark;
