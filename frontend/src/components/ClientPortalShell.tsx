import { Outlet } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '../lib/authContext'
import { Button } from './ui/button'

export function ClientPortalShell() {
  const { session, logout } = useAuth()

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <div>
            <span className="text-lg font-semibold tracking-tight text-foreground">Performy</span>
            <p className="text-xs text-muted-foreground">{session?.user.email}</p>
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
    </div>
  )
}
