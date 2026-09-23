import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initServiceWorker } from './lib/update.js'

initServiceWorker()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Take the runway body::after leaves us, after the first layout — see index.css. Scrolling
// the document off 0 is the whole point; one frame is enough and there is nothing to undo,
// because the 1px it moves is the 1px the runway added.
requestAnimationFrame(() => window.scrollTo(0, 1))
