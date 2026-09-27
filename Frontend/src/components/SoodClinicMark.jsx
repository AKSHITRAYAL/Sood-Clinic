import originalSoodLogo from '../assets/brand/AK_Sood_Logo.png';

const SoodClinicMark = ({ compact = false }) => (
  <span className={`brand-logo ${compact ? 'brand-logo--compact' : ''}`} aria-label="Sood Clinic">
    <span className="brand-logo__crop">
      <img src={originalSoodLogo} alt="AK Sood original logo" />
    </span>
    {!compact && <span className="brand-logo__name">Sood Clinic</span>}
  </span>
);

export default SoodClinicMark;
