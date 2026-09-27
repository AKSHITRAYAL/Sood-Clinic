import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { ThemeProvider } from "./components/theme-provider.jsx"


createRoot(document.getElementById('root')).render(
  <StrictMode>
      <ThemeProvider>

        <App />
      </ThemeProvider>

  </StrictMode>,
)
