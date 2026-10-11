import { ReCaptchaEnterpriseProvider, initializeAppCheck } from 'firebase/app-check';

export const initializeOptionalAppCheck = (app) => {
  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY?.trim();
  if (!siteKey) return null;
  return initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
};
