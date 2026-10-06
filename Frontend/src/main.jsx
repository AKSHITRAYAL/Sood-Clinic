import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from '@app-entry'
import { authReady, initializeAnalytics } from './lib/firebase.js'

async function bootstrap() {
  await authReady;
  if (import.meta.env.MODE === 'public') void initializeAnalytics();
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
