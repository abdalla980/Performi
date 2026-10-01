import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/authContext'
import { ApiClientProvider } from '../lib/apiClientContext'
import { ClientPortalApiClientProvider } from '../lib/clientPortalApiClientContext'
import { AccountNotLinkedError, WhoAmIUnauthorizedError, fetchWhoAmI } from '../lib/whoAmI'
import { Button } from './ui/button'
import type { Role } from '../lib/types'

function LoadingScreen() {
  return <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">Loading…</div>
}

function AccountNotLinkedScreen({ email, onLogout }: { email: string | undefined; onLogout: () => void }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <p className="max-w-md text-sm text-muted-foreground">
        You&apos;re signed in as <span className="font-medium text-foreground">{email}</span>, but this account
        isn&apos;t linked to an agency or client in Performi yet. Ask your agency (or support) to link it, or sign
        in with a different account.
      </p>
      <Button type="button" variant="outline" onClick={onLogout}>
        Log out
      </Button>
    </div>
  )
}

export function RequireRole({ role }: { role: Role }) {
  const { session, loading: authLoading, logout, getAuthToken } = useAuth()

  const {
    data: whoAmI,
    isPending: whoAmIPending,
    isError,
    error,
  } = useQuery({
    queryKey: ['whoami'],
    queryFn: async () => fetchWhoAmI({ baseUrl: import.meta.env.VITE_API_BASE_URL, token: await getAuthToken() }),
    enabled: Boolean(session),
    // A 401 won't change on retry; only network/server errors are worth retrying.
    retry: (failureCount, err) => !(err instanceof WhoAmIUnauthorizedError) && failureCount < 3,
  })

  const notLinked = error instanceof AccountNotLinkedError

  // A whoami failure means the backend has rejected this session's token (expired,
  // revoked, whatever) — just redirecting to /login isn't enough, since Supabase's
  // local session object is still sitting there non-null, and LoginPage redirects
  // straight back to "/" whenever session is truthy. Without actually signing out,
  // that's an infinite redirect loop between "/" and "/login" (confirmed: this
  // produced 79 repeated /whoami 401s in one session before this fix).
  // An unlinked account is the exception: its token is fine, so signing out would
  // only send the user back to a login that lands them here again.
  useEffect(() => {
    if (isError && !notLinked) {
      logout()
    }
  }, [isError, notLinked, logout])

  if (authLoading || (session && whoAmIPending)) {
    return <LoadingScreen />
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (notLinked) {
    return <AccountNotLinkedScreen email={session.user.email} onLogout={() => logout()} />
  }

  if (isError || !whoAmI) {
    return <Navigate to="/login" replace />
  }

  if (whoAmI.role !== role) {
    return <Navigate to={whoAmI.role === 'client' ? '/portal' : '/'} replace />
  }

  if (role === 'client') {
    return (
      <ClientPortalApiClientProvider>
        <Outlet />
      </ClientPortalApiClientProvider>
    )
  }

  return (
    <ApiClientProvider>
      <Outlet />
    </ApiClientProvider>
  )
}
