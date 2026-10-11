import PropTypes from 'prop-types';
import { passwordRequirements } from '../lib/passwordPolicy';

const PasswordRequirements = ({ password }) => {
  const checks = passwordRequirements(password);
  const items = [
    ['minimumLength', `Minimum characters ${Math.min(String(password || '').length, 8)}/8`],
    ['uppercase', 'At least one capital letter'],
    ['lowercase', 'At least one small letter'],
    ['number', 'At least one number'],
    ['special', 'At least one special character (! @ # $)'],
  ];

  return <ul className="password-requirements" aria-label="Password requirements">
    {items.map(([key, label]) => <li key={key} className={checks[key] ? 'is-met' : ''}><span aria-hidden="true">{checks[key] ? '✓' : '○'}</span>{label}</li>)}
  </ul>;
};

PasswordRequirements.propTypes = { password: PropTypes.string.isRequired };

export default PasswordRequirements;
