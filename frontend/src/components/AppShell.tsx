import { NavLink, Outlet } from 'react-router-dom'
import { AlertTriangle, ClipboardList, ListChecks, LogOut, Rocket, Settings, Users } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/authContext'
import { useApiClient } from '../lib/apiClientContext'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { PerformiLogo } from './PerformiLogo'
import { NotificationsMenu } from './NotificationsMenu'

const NAV_ITEMS = [
  { to: '/', label: 'Campaigns', icon: ListChecks, end: true },
  { to: '/launched', label: 'Launched', icon: Rocket, end: false },
  { to: '/clients', label: 'Clients', icon: Users, end: false },
  { to: '/audit', label: 'Activity', icon: ClipboardList, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
]

export function AppShell() {
  const { session, logout } = useAuth()
  const apiClient = useApiClient()
  const { data: configStatus } = useQuery({
    queryKey: ['config-status'],
    queryFn: () => apiClient.getConfigStatus(),
  })

  const demoModeActive =
    configStatus &&
    (!configStatus.anthropicConfigured || !configStatus.googleAdsConfigured || !configStatus.metaConfigured)

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
        <div className="px-5 py-5">
          <PerformiLogo />
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-card hover:text-foreground',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border px-3 py-4">
          <p className="truncate px-3 text-xs text-muted-foreground">{session?.user.email}</p>
          <Button variant="ghost" className="mt-1 w-full justify-start gap-2 px-3" onClick={() => logout()}>
            <LogOut className="h-4 w-4" />
            Log out
          </Button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-end border-b border-border px-6 py-3">
          <NotificationsMenu />
        </div>
        {demoModeActive && (
          <div className="flex items-center gap-2 border-b border-accent/30 bg-accent-soft px-6 py-2 text-sm text-foreground">
            <AlertTriangle className="h-4 w-4 shrink-0 text-accent" />
            Demo mode: some integrations aren't configured yet, so those steps use simulated data.
          </div>
        )}
        <main className="flex-1 overflow-y-auto px-8 py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
