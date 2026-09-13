import { NavLink, Outlet } from 'react-router-dom'
import { AlertTriangle, ClipboardList, ListChecks, LogOut, Rocket, Settings, Users } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/authContext'
import { useApiClient } from '../lib/apiClientContext'
import { cn } from '../lib/utils'
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

  const email = session?.user.email ?? ''

  return (
    <div className="flex min-h-svh bg-background">
      <aside className="sticky top-0 flex h-svh w-64 shrink-0 flex-col border-r border-border/70 bg-card">
        <div className="px-6 pb-6 pt-6">
          <PerformiLogo />
        </div>
        <nav className="flex flex-1 flex-col gap-1.5 px-4">
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-[15px] font-medium transition-colors',
                  isActive
                    ? 'border-primary/25 bg-primary-soft text-primary'
                    : 'border-transparent text-muted-foreground hover:bg-surface hover:text-foreground',
                )
              }
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="flex flex-col gap-1 border-t border-border/70 px-4 py-4">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold uppercase text-primary-foreground">
              {email.charAt(0) || '?'}
            </div>
            <p className="min-w-0 truncate text-sm font-medium text-foreground">{email}</p>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[15px] font-medium text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Log out
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-end gap-3 border-b border-border/70 bg-card/80 px-8 backdrop-blur">
          <NotificationsMenu />
        </header>
        {demoModeActive && (
          <div className="flex items-center gap-2 border-b border-accent/30 bg-accent-soft px-8 py-2 text-sm text-foreground">
            <AlertTriangle className="h-4 w-4 shrink-0 text-accent" />
            Demo mode: some integrations aren't configured yet, so those steps use simulated data.
          </div>
        )}
        <main className="flex-1 overflow-y-auto px-10 py-10">
          <div className="mx-auto w-full max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
