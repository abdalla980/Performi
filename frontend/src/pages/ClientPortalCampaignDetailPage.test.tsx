import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ClientPortalCampaignDetailPage } from './ClientPortalCampaignDetailPage'
import { createFakeClientPortalApiClient } from '../test/fakeClientPortalApiClient'
import { renderWithClientPortalProviders } from '../test/renderWithClientPortalProviders'
import type { ClientPortalCampaignDetail } from '../lib/types'

function baseCampaign(overrides: Partial<ClientPortalCampaignDetail> = {}): ClientPortalCampaignDetail {
  return {
    id: 'draft-1',
    briefId: 'brief-1',
    status: 'approved',
    businessDescription: 'Local bakery campaign',
    budgetUsd: 500,
    goals: 'Traffic',
    createdAt: '2026-07-09T00:00:00Z',
    websiteUrl: null,
    targetLocation: null,
    targetAudience: null,
    endDate: null,
    platforms: ['google'],
    googlePlan: {
      campaignName: 'Austin Bakery',
      dailyBudgetMicros: 16_500_000,
      endDate: null,
      finalUrl: null,
      negativeKeywords: [],
      adGroups: [],
    },
    metaPlan: null,
    projectedMetrics: null,
    launches: [],
    ...overrides,
  }
}

describe('ClientPortalCampaignDetailPage', () => {
  it('shows the campaign plan and lets the client approve', async () => {
    const campaign = baseCampaign()
    const decideCampaign = vi.fn().mockResolvedValue({ status: 'client_approved' })
    const apiClient = createFakeClientPortalApiClient({ getCampaign: async () => campaign, decideCampaign })

    renderWithClientPortalProviders(<ClientPortalCampaignDetailPage />, {
      apiClient,
      path: '/portal/campaigns/:draftId',
      initialEntries: ['/portal/campaigns/draft-1'],
    })

    expect(await screen.findByText('$16.50/day')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^approve$/i }))

    await waitFor(() => expect(decideCampaign).toHaveBeenCalledWith('draft-1', 'approved'))
  })

  it('lets the client reject', async () => {
    const campaign = baseCampaign()
    const decideCampaign = vi.fn().mockResolvedValue({ status: 'client_rejected' })
    const apiClient = createFakeClientPortalApiClient({ getCampaign: async () => campaign, decideCampaign })

    renderWithClientPortalProviders(<ClientPortalCampaignDetailPage />, {
      apiClient,
      path: '/portal/campaigns/:draftId',
      initialEntries: ['/portal/campaigns/draft-1'],
    })

    await userEvent.click(await screen.findByRole('button', { name: /^reject$/i }))

    await waitFor(() => expect(decideCampaign).toHaveBeenCalledWith('draft-1', 'rejected'))
  })

  it('does not show approve/reject once already decided', async () => {
    const campaign = baseCampaign({ status: 'client_approved' })
    const apiClient = createFakeClientPortalApiClient({ getCampaign: async () => campaign })

    renderWithClientPortalProviders(<ClientPortalCampaignDetailPage />, {
      apiClient,
      path: '/portal/campaigns/:draftId',
      initialEntries: ['/portal/campaigns/draft-1'],
    })

    await screen.findByText('$16.50/day')
    expect(screen.queryByRole('button', { name: /^approve$/i })).not.toBeInTheDocument()
  })
})
