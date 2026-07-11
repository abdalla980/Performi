import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { RequireAuth } from './components/RequireAuth'
import { AuditLogPage } from './pages/AuditLogPage'
import { CampaignsPage } from './pages/CampaignsPage'
import { ClientDetailPage } from './pages/ClientDetailPage'
import { ClientsPage } from './pages/ClientsPage'
import { DraftDetailPage } from './pages/DraftDetailPage'
import { LoginPage } from './pages/LoginPage'
import { NewBriefPage } from './pages/NewBriefPage'
import { NewClientPage } from './pages/NewClientPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route index element={<CampaignsPage />} />
          <Route path="campaigns/new" element={<NewBriefPage />} />
          <Route path="campaigns/:draftId" element={<DraftDetailPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/new" element={<NewClientPage />} />
          <Route path="clients/:clientId" element={<ClientDetailPage />} />
          <Route path="audit" element={<AuditLogPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
