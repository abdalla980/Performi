import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { GettingStartedCard } from './GettingStartedCard'
import { renderWithProviders } from '../test/renderWithProviders'
import { createFakeApiClient } from '../test/fakeApiClient'

describe('GettingStartedCard', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('walks a new agency through the four steps, including Activity', () => {
    const apiClient = createFakeApiClient({})
    renderWithProviders(<GettingStartedCard />, { apiClient })

    expect(screen.getByText('Add a client')).toBeInTheDocument()
    expect(screen.getByText('Submit a brief')).toBeInTheDocument()
    expect(screen.getByText('Review & approve')).toBeInTheDocument()
    expect(screen.getByText(/Activity/)).toBeInTheDocument()

    expect(screen.getByRole('link', { name: /add a client/i })).toHaveAttribute('href', '/clients/new')
    expect(screen.getByRole('link', { name: /submit a brief/i })).toHaveAttribute('href', '/campaigns/new')
  })

  it('dismisses and stays dismissed on remount', async () => {
    const apiClient = createFakeApiClient({})
    const { unmount } = renderWithProviders(<GettingStartedCard />, { apiClient })

    await userEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByText('Add a client')).not.toBeInTheDocument()
    expect(localStorage.getItem('performi-getting-started-dismissed')).toBe('true')

    unmount()
    renderWithProviders(<GettingStartedCard />, { apiClient })
    expect(screen.queryByText('Add a client')).not.toBeInTheDocument()
  })

  it('does not render at all if already dismissed in a prior session', () => {
    localStorage.setItem('performi-getting-started-dismissed', 'true')
    const apiClient = createFakeApiClient({})
    renderWithProviders(<GettingStartedCard />, { apiClient })

    expect(screen.queryByText('Add a client')).not.toBeInTheDocument()
  })
})
