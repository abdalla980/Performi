import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { loginWithPassword, supabase } from './supabaseClient'

interface AuthContextValue {
  session: Session | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  getAuthToken: () => Promise<string>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      // Local development only: skip the login page by signing in with credentials
      // from the git-ignored frontend/.env.local. Production builds strip this branch
      // (import.meta.env.DEV is false), so deployed apps always require a real login.
      const email = import.meta.env.VITE_DEV_AUTOLOGIN_EMAIL
      const password = import.meta.env.VITE_DEV_AUTOLOGIN_PASSWORD
      if (!data.session && import.meta.env.DEV && email && password) {
        await loginWithPassword(email, password).catch(() => undefined)
      }
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => subscription.unsubscribe()
  }, [])

  const getAuthToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    if (!data.session) {
      throw new Error('Not authenticated')
    }
    return data.session.access_token
  }, [])

  const logout = useCallback(() => supabase.auth.signOut().then(() => undefined), [])

  const value = useMemo<AuthContextValue>(
    () => ({ session, loading, login: loginWithPassword, logout, getAuthToken }),
    [session, loading, logout, getAuthToken],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
