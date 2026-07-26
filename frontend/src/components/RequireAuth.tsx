import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../lib/authContext'
import { ApiClientProvider } from '../lib/apiClientContext'
import { ClientPortalApiClientProvider } from '../lib/clientPortalApiClientContext'
import { fetchWhoAmI } from '../lib/whoAmI'
import type { Role } from '../lib/types'

function LoadingScreen() {
  return <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">Loading…</div>
}

export function RequireRole({ role }: { role: Role }) {
  const { session, loading: authLoading, logout, getAuthToken } = useAuth()

  const {
    data: whoAmI,
    isPending: whoAmIPending,
    isError,
  } = useQuery({
    queryKey: ['whoami'],
    queryFn: async () => fetchWhoAmI({ baseUrl: import.meta.env.VITE_API_BASE_URL, token: await getAuthToken() }),
    enabled: Boolean(session),
  })

  // A whoami failure means the backend has rejected this session's token (expired,
  // revoked, whatever) — just redirecting to /login isn't enough, since Supabase's
  // local session object is still sitting there non-null, and LoginPage redirects
  // straight back to "/" whenever session is truthy. Without actually signing out,
  // that's an infinite redirect loop between "/" and "/login" (confirmed: this
  // produced 79 repeated /whoami 401s in one session before this fix).
  useEffect(() => {
    if (isError) {
      logout()
    }
  }, [isError, logout])

  if (authLoading || (session && whoAmIPending)) {
    return <LoadingScreen />
  }

  if (!session) {
    return <Navigate to="/login" replace />
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
