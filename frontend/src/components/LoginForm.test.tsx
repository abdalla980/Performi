import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LoginForm } from './LoginForm'

describe('LoginForm', () => {
  it('calls onLogin with the entered email and password', async () => {
    const user = userEvent.setup()
    const onLogin = vi.fn().mockResolvedValue(undefined)
    render(<LoginForm onLogin={onLogin} />)

    await user.type(screen.getByLabelText(/email/i), 'owner@acme.test')
    await user.type(screen.getByLabelText(/password/i), 'correct horse')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledWith('owner@acme.test', 'correct horse')
    })
  })

  it('shows an error message when login fails', async () => {
    const user = userEvent.setup()
    const onLogin = vi.fn().mockRejectedValue(new Error('Invalid login credentials'))
    render(<LoginForm onLogin={onLogin} />)

    await user.type(screen.getByLabelText(/email/i), 'owner@acme.test')
    await user.type(screen.getByLabelText(/password/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByText(/invalid login credentials/i)).toBeInTheDocument()
  })
})
