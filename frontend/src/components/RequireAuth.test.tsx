import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { RequireRole } from './RequireAuth'

const mockUseAuth = vi.fn()
vi.mock('../lib/authContext', () => ({
  useAuth: () => mockUseAuth(),
}))

const mockFetchWhoAmI = vi.fn()
vi.mock('../lib/whoAmI', () => ({
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
    mockFetchWhoAmI.mockRejectedValue(new Error('Invalid token'))

    renderRequireRole()

    await screen.findByText('Login screen')
    await waitFor(() => expect(logout).toHaveBeenCalled())
  })
})
