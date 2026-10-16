import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const CONSENT_KEY = 'sood-public-consent-v1';

const ConsentBanner = () => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try { setVisible(!window.localStorage.getItem(CONSENT_KEY)); } catch { setVisible(false); }
  }, []);
  const accept = () => {
    try { window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ version: 'public-v1', acceptedAt: new Date().toISOString() })); } catch { /* private browsing may reject storage */ }
    setVisible(false);
  };
  if (!visible) return null;
  return <aside className="consent-banner" role="dialog" aria-label="Privacy choices"><div><strong>Privacy choices</strong><p>We use only essential storage for this website and do not load analytics before you choose. Read our <Link to="/privacy">privacy notice</Link>.</p></div><button type="button" onClick={accept}>Continue</button></aside>;
};

export default ConsentBanner;
