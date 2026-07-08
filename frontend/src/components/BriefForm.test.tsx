import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BriefForm } from './BriefForm'

describe('BriefForm', () => {
  it('submits the entered brief', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<BriefForm clientId="client-1" onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText(/business description/i), 'Local bakery in Austin')
    await user.type(screen.getByLabelText(/budget/i), '500')
    await user.type(screen.getByLabelText(/goal/i), 'Drive foot traffic')
    await user.click(screen.getByRole('button', { name: /generate campaign/i }))

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        clientId: 'client-1',
        businessDescription: 'Local bakery in Austin',
        budgetUsd: 500,
        goals: 'Drive foot traffic',
      })
    })
  })

  it('rejects a zero or negative budget without calling onSubmit', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    render(<BriefForm clientId="client-1" onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText(/business description/i), 'Local bakery in Austin')
    await user.type(screen.getByLabelText(/budget/i), '0')
    await user.type(screen.getByLabelText(/goal/i), 'Drive foot traffic')
    await user.click(screen.getByRole('button', { name: /generate campaign/i }))

    expect(await screen.findByText(/budget must be greater than zero/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('disables the submit button while submitting', async () => {
    const user = userEvent.setup()
    let resolveSubmit: () => void = () => {}
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve
        }),
    )
    render(<BriefForm clientId="client-1" onSubmit={onSubmit} />)

    await user.type(screen.getByLabelText(/business description/i), 'Local bakery in Austin')
    await user.type(screen.getByLabelText(/budget/i), '500')
    await user.type(screen.getByLabelText(/goal/i), 'Drive foot traffic')
    await user.click(screen.getByRole('button', { name: /generate campaign/i }))

    expect(screen.getByRole('button', { name: /generating/i })).toBeDisabled()
    resolveSubmit()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate campaign/i })).not.toBeDisabled()
    })
  })
})
