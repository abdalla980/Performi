import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ClientPortalShell } from './components/ClientPortalShell'
import { RequireRole } from './components/RequireAuth'
import { AuditLogPage } from './pages/AuditLogPage'
import { CampaignsPage } from './pages/CampaignsPage'
import { ClientDetailPage } from './pages/ClientDetailPage'
import { ClientPortalCampaignDetailPage } from './pages/ClientPortalCampaignDetailPage'
import { ClientPortalCampaignsPage } from './pages/ClientPortalCampaignsPage'
import { ClientsPage } from './pages/ClientsPage'
import { ClientSummaryPage } from './pages/ClientSummaryPage'
import { DraftDetailPage } from './pages/DraftDetailPage'
import { LaunchedCampaignsPage } from './pages/LaunchedCampaignsPage'
import { LoginPage } from './pages/LoginPage'
import { NewBriefPage } from './pages/NewBriefPage'
import { NewClientPage } from './pages/NewClientPage'
import { SettingsPage } from './pages/SettingsPage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireRole role="agency" />}>
        <Route path="campaigns/:draftId/summary" element={<ClientSummaryPage />} />
        <Route element={<AppShell />}>
          <Route index element={<CampaignsPage />} />
          <Route path="launched" element={<LaunchedCampaignsPage />} />
          <Route path="campaigns/new" element={<NewBriefPage />} />
          <Route path="campaigns/:draftId" element={<DraftDetailPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="clients/new" element={<NewClientPage />} />
          <Route path="clients/:clientId" element={<ClientDetailPage />} />
          <Route path="audit" element={<AuditLogPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route element={<RequireRole role="client" />}>
        <Route element={<ClientPortalShell />}>
          <Route path="portal" element={<ClientPortalCampaignsPage />} />
          <Route path="portal/campaigns/:draftId" element={<ClientPortalCampaignDetailPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
