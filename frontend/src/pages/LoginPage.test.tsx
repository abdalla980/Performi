import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'

const mockUseAuth = vi.fn()
vi.mock('../lib/authContext', () => ({
  useAuth: () => mockUseAuth(),
}))

vi.mock('../components/LoginForm', () => ({
  LoginForm: ({ onLogin }: { onLogin: (email: string, password: string) => Promise<void> }) => (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void onLogin('a@b.test', 'secret')
      }}
    >
      <button type="submit">Sign in</button>
    </form>
  ),
}))

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>Home</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  it('shows an interstitial when a session already exists', async () => {
    const logout = vi.fn().mockResolvedValue(undefined)
    mockUseAuth.mockReturnValue({
      session: { user: { email: 'agency@acme.test' } },
      loading: false,
      login: vi.fn(),
      logout,
      getAuthToken: async () => 'token',
    })

    renderLoginPage()

    expect(screen.getByText(/already signed in as/i)).toBeInTheDocument()
    expect(screen.getByText('agency@acme.test')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^continue$/i })).toHaveAttribute('href', '/')

    await userEvent.click(screen.getByRole('button', { name: /log out & use a different account/i }))
    expect(logout).toHaveBeenCalled()
  })

  it('shows the login form when there is no session', () => {
    mockUseAuth.mockReturnValue({
      session: null,
      loading: false,
      login: vi.fn(),
      logout: vi.fn(),
      getAuthToken: async () => {
        throw new Error('Not authenticated')
      },
    })

    renderLoginPage()

    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.queryByText(/already signed in as/i)).not.toBeInTheDocument()
  })
})
