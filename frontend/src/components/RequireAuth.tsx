import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/authContext'
import { ApiClientProvider } from '../lib/apiClientContext'

export function RequireAuth() {
  const { session, loading } = useAuth()

  if (loading) {
    return <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">Loading…</div>
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  return (
    <ApiClientProvider>
      <Outlet />
    </ApiClientProvider>
  )
}
