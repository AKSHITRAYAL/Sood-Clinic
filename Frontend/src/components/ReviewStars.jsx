import PropTypes from 'prop-types';
const ReviewStars = ({ rating }) => <span className="review-stars" role="img" aria-label={`${rating} out of 5 stars`}><span aria-hidden="true">{'★'.repeat(Math.round(rating))}{'☆'.repeat(5 - Math.round(rating))}</span></span>;
ReviewStars.propTypes = { rating: PropTypes.number.isRequired };
export default ReviewStars;
