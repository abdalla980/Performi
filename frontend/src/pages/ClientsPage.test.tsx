import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ClientsPage } from './ClientsPage'
import { createFakeApiClient } from '../test/fakeApiClient'
import { renderWithProviders } from '../test/renderWithProviders'

describe('ClientsPage', () => {
  it('lists clients with their connection status', async () => {
    const apiClient = createFakeApiClient({
      listClients: async () => [
        {
          id: 'client-1',
          name: 'Acme Bakery',
          googleAdsCustomerId: null,
          metaAdAccountId: null,
          googleConnected: true,
          metaConnected: false,
          logoUrl: null,
        },
      ],
    })
    renderWithProviders(<ClientsPage />, { apiClient })

    expect(await screen.findByText('Acme Bakery')).toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('Not connected')).toBeInTheDocument()
  })

  it('shows onboarding guidance with no clients', async () => {
    const apiClient = createFakeApiClient({ listClients: async () => [] })
    renderWithProviders(<ClientsPage />, { apiClient })

    expect(await screen.findByText('Add your first client')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /add client/i }).length).toBeGreaterThan(0)
  })
})
