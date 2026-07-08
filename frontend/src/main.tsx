import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App.tsx'
import { createMockApiClient } from './lib/apiClient.mock.ts'
import { loginWithPassword } from './lib/supabaseClient.ts'

// TODO(Task 10): swap createMockApiClient() for a real fetch-based ApiClient
// once the backend exists, and replace the hardcoded clientId with whatever
// client the logged-in agency actually has connected.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App apiClient={createMockApiClient()} onLogin={loginWithPassword} clientId={import.meta.env.VITE_MVP_CLIENT_ID ?? ''} />
  </StrictMode>,
)
