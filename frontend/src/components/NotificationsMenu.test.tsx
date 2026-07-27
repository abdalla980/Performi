import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { NotificationsMenu } from './NotificationsMenu'
import { createFakeApiClient } from '../test/fakeApiClient'
import { renderWithProviders } from '../test/renderWithProviders'
import type { Notification } from '../lib/types'

const ITEMS: Notification[] = [
  { draftId: 'draft-1', clientName: 'Acme Bakery', kind: 'pending_approval_stale', daysStale: 4 },
]

describe('NotificationsMenu', () => {
  it('shows a count badge and lists stale drafts on click', async () => {
    const apiClient = createFakeApiClient({ listNotifications: async () => ITEMS })
    renderWithProviders(<NotificationsMenu />, { apiClient })

    expect(await screen.findByText('1')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Notifications'))

    expect(screen.getByText('Acme Bakery')).toBeInTheDocument()
    expect(screen.getByText(/Awaiting your review/)).toBeInTheDocument()
  })

  it('shows an empty state when nothing needs attention', async () => {
    const apiClient = createFakeApiClient({ listNotifications: async () => [] })
    renderWithProviders(<NotificationsMenu />, { apiClient })

    await userEvent.click(await screen.findByLabelText('Notifications'))

    expect(screen.getByText('Nothing needs your attention.')).toBeInTheDocument()
  })
})
