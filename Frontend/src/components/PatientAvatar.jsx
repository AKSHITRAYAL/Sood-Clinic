import PropTypes from 'prop-types';

const initialsFor = (name) => (name || 'Patient')
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part[0])
  .join('')
  .toUpperCase();

const PatientAvatar = ({ name, photoUrl, className = '' }) => (
  <span className={`patient-avatar ${className}`.trim()} aria-label={`${name || 'Patient'} profile`}>
    {photoUrl ? <img src={photoUrl} alt="" /> : initialsFor(name)}
  </span>
);

PatientAvatar.propTypes = {
  name: PropTypes.string,
  photoUrl: PropTypes.string,
  className: PropTypes.string,
};

export default PatientAvatar;
