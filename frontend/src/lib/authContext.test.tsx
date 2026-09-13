import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { getSession, loginWithPassword } = vi.hoisted(() => ({
  getSession: vi.fn(),
  loginWithPassword: vi.fn(),
}))

vi.mock('./supabaseClient', () => ({
  loginWithPassword,
  supabase: {
    auth: {
      getSession,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: vi.fn().mockResolvedValue({}),
    },
  },
}))

import { AuthProvider } from './authContext'

describe('AuthProvider dev auto-login', () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ data: { session: null } })
    loginWithPassword.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('logs in with the local dev credentials when no one is signed in', async () => {
    vi.stubEnv('VITE_DEV_AUTOLOGIN_EMAIL', 'agency@example.test')
    vi.stubEnv('VITE_DEV_AUTOLOGIN_PASSWORD', 'local-only')

    render(<AuthProvider>app</AuthProvider>)

    await waitFor(() => expect(loginWithPassword).toHaveBeenCalledWith('agency@example.test', 'local-only'))
  })

  it('does nothing when the dev credentials are not configured', async () => {
    vi.stubEnv('VITE_DEV_AUTOLOGIN_EMAIL', '')
    vi.stubEnv('VITE_DEV_AUTOLOGIN_PASSWORD', '')

    render(<AuthProvider>app</AuthProvider>)

    await waitFor(() => expect(getSession).toHaveBeenCalled())
    expect(loginWithPassword).not.toHaveBeenCalled()
  })

  it('never auto-logs in outside development builds', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DEV_AUTOLOGIN_EMAIL', 'agency@example.test')
    vi.stubEnv('VITE_DEV_AUTOLOGIN_PASSWORD', 'local-only')

    render(<AuthProvider>app</AuthProvider>)

    await waitFor(() => expect(getSession).toHaveBeenCalled())
    expect(loginWithPassword).not.toHaveBeenCalled()
  })

  it('leaves an existing session alone', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 't' } } })
    vi.stubEnv('VITE_DEV_AUTOLOGIN_EMAIL', 'agency@example.test')
    vi.stubEnv('VITE_DEV_AUTOLOGIN_PASSWORD', 'local-only')

    render(<AuthProvider>app</AuthProvider>)

    await waitFor(() => expect(getSession).toHaveBeenCalled())
    expect(loginWithPassword).not.toHaveBeenCalled()
  })
})
