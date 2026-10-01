import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { RequireRole } from './RequireAuth'
import { AccountNotLinkedError, WhoAmIUnauthorizedError } from '../lib/whoAmI'
import userEvent from '@testing-library/user-event'

const mockUseAuth = vi.fn()
vi.mock('../lib/authContext', () => ({
  useAuth: () => mockUseAuth(),
}))

const mockFetchWhoAmI = vi.fn()
vi.mock('../lib/whoAmI', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/whoAmI')>()),
  fetchWhoAmI: (...args: unknown[]) => mockFetchWhoAmI(...args),
}))

function renderRequireRole() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<RequireRole role="agency" />}>
            <Route index element={<div>Protected content</div>} />
          </Route>
          <Route path="/login" element={<div>Login screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RequireRole', () => {
  it('signs out instead of just redirecting when whoami confirms the session is invalid', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    mockUseAuth.mockReturnValue({
      session: { user: { email: 'stale@acme.test' } },
      loading: false,
      logout,
      getAuthToken: async () => 'stale-token',
    })
    mockFetchWhoAmI.mockRejectedValue(new WhoAmIUnauthorizedError('Invalid token'))

    renderRequireRole()

    await screen.findByText('Login screen')
    await waitFor(() => expect(logout).toHaveBeenCalled())
  })

  it('explains an unlinked account instead of bouncing back to the login page', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    mockUseAuth.mockReturnValue({
      session: { user: { email: 'owner@acme.test' } },
      loading: false,
      logout,
      getAuthToken: async () => 'valid-token',
    })
    mockFetchWhoAmI.mockRejectedValue(new AccountNotLinkedError())

    renderRequireRole()

    expect(await screen.findByText(/isn.t linked to an agency or client/i)).toBeInTheDocument()
    expect(screen.getByText('owner@acme.test')).toBeInTheDocument()
    expect(screen.queryByText('Login screen')).not.toBeInTheDocument()
    expect(logout).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('button', { name: /log out/i }))
    expect(logout).toHaveBeenCalled()
  })
})
