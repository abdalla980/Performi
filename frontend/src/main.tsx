import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App.tsx'
import { createMockApiClient } from './lib/apiClient.mock.ts'

// TEMPORARY DEMO WIRING — not committed. Bypasses Supabase login and the real
// backend so the brief/review/launch screens can be viewed without live credentials.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App apiClient={createMockApiClient()} onLogin={async () => {}} clientId={import.meta.env.VITE_MVP_CLIENT_ID ?? ''} />
  </StrictMode>,
)
