import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './theme/index.css'
import { startServiceWorker } from './lib/appShell'
import { lock } from './features/lock/useLock'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

startServiceWorker()
// Phase 2: is there a PIN, and is this page unlocked? (A no-op with it off.)
void lock.init()
