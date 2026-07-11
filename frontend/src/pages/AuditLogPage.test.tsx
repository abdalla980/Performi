import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuditLogPage } from './AuditLogPage'
import { createFakeApiClient } from '../test/fakeApiClient'
import { renderWithProviders } from '../test/renderWithProviders'

describe('AuditLogPage', () => {
  it('lists audit entries with a formatted payload', async () => {
    const apiClient = createFakeApiClient({
      listAuditLog: async () => [
        {
          id: 'audit-1',
          clientId: 'client-1',
          eventType: 'brief.submitted',
          payload: { brief_id: 'brief-1' },
          createdAt: '2026-07-09T00:00:00Z',
        },
      ],
    })
    renderWithProviders(<AuditLogPage />, { apiClient })

    expect(await screen.findByText('brief.submitted')).toBeInTheDocument()
    expect(screen.getByText(/brief_id: brief-1/)).toBeInTheDocument()
  })

  it('shows an empty state with no activity', async () => {
    const apiClient = createFakeApiClient({ listAuditLog: async () => [] })
    renderWithProviders(<AuditLogPage />, { apiClient })

    expect(await screen.findByText('No activity yet.')).toBeInTheDocument()
  })
})
