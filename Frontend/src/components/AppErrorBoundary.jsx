import { Component } from 'react';
import PropTypes from 'prop-types';

// Keep the recovery surface deliberately generic: error details can contain
// patient or staff context and must never be exposed or sent to analytics.
class AppErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() { return { failed: true }; }

  render() {
    const { children, staff } = this.props;
    if (!this.state.failed) return children;
    return <main className={`app-error-boundary${staff ? ' app-error-boundary--staff' : ''}`} role="alert">
      <section>
        <p>{staff ? 'SECURE WORKSPACE' : 'SOOD CLINIC'}</p>
        <h1>Something needs a refresh</h1>
        <span>Your information has not been changed. Please reload this page and try again.</span>
        <button type="button" onClick={() => window.location.reload()}>Reload page</button>
      </section>
    </main>;
  }
}

AppErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  staff: PropTypes.bool,
};

AppErrorBoundary.defaultProps = { staff: false };

export default AppErrorBoundary;
