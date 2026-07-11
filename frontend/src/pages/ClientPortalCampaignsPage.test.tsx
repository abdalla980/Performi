import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ClientPortalCampaignsPage } from './ClientPortalCampaignsPage'
import { createFakeClientPortalApiClient } from '../test/fakeClientPortalApiClient'
import { renderWithClientPortalProviders } from '../test/renderWithClientPortalProviders'
import type { ClientPortalCampaignSummary } from '../lib/types'

describe('ClientPortalCampaignsPage', () => {
  it('lists campaigns with their status', async () => {
    const campaigns: ClientPortalCampaignSummary[] = [
      {
        id: 'draft-1',
        briefId: 'brief-1',
        status: 'approved',
        businessDescription: 'Local bakery campaign',
        budgetUsd: 500,
        goals: 'Traffic',
        createdAt: '2026-07-09T00:00:00Z',
      },
    ]
    const apiClient = createFakeClientPortalApiClient({ listCampaigns: async () => campaigns })

    renderWithClientPortalProviders(<ClientPortalCampaignsPage />, { apiClient })

    expect(await screen.findByText('Local bakery campaign')).toBeInTheDocument()
    expect(screen.getByText('Awaiting client approval')).toBeInTheDocument()
  })

  it('shows an empty state with no campaigns', async () => {
    const apiClient = createFakeClientPortalApiClient({ listCampaigns: async () => [] })

    renderWithClientPortalProviders(<ClientPortalCampaignsPage />, { apiClient })

    expect(await screen.findByText('No campaigns are ready for your review yet.')).toBeInTheDocument()
  })
})
