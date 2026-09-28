import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { authReady, initializeAnalytics } from './lib/firebase.js'

async function bootstrap() {
  await authReady;
  void initializeAnalytics();
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
