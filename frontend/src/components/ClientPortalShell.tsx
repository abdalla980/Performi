import { Outlet } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/authContext'
import { fetchWhoAmI } from '../lib/whoAmI'
import { Avatar } from './ui/avatar'
import { Button } from './ui/button'

export function ClientPortalShell() {
  const { session, logout, getAuthToken } = useAuth()
  // This portal is white-labeled: the client's relationship is with their
  // agency, not with this product, so the agency's name is the primary
  // heading here — never "Performi" (see whoami's agency_name for role: client).
  const { data: whoAmI } = useQuery({
    queryKey: ['whoami'],
    queryFn: async () => fetchWhoAmI({ baseUrl: import.meta.env.VITE_API_BASE_URL, token: await getAuthToken() }),
    enabled: Boolean(session),
  })

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            {whoAmI?.agencyName && <Avatar name={whoAmI.agencyName} src={null} />}
            <div>
            <span className="font-display text-lg font-semibold tracking-tight text-foreground">
              {whoAmI?.agencyName ?? ' '}
            </span>
            <p className="text-xs text-muted-foreground">{session?.user.email}</p>
            </div>
          </div>
          <Button variant="ghost" className="gap-2" onClick={() => logout()}>
            <LogOut className="h-4 w-4" />
            Log out
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        <Outlet />
      </main>
      <footer className="py-4 text-center text-xs text-muted-foreground">
        Powered by <span className="font-display font-medium text-foreground">Perform<span className="text-primary">i</span></span>
      </footer>
    </div>
  )
}
