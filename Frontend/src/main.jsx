import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from '@app-entry'

// Authentication persistence settles in the background. Individual auth flows
// await authReady where needed; delaying the entire application here makes a
// first visit unnecessarily feel slow on unreliable connections.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
