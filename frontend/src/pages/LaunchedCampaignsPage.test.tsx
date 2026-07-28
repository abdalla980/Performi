import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LaunchedCampaignsPage } from './LaunchedCampaignsPage'
import { createFakeApiClient } from '../test/fakeApiClient'
import { renderWithProviders } from '../test/renderWithProviders'
import type { DraftSummary } from '../lib/types'

const LAUNCHED: DraftSummary = {
  id: 'draft-1',
  briefId: 'brief-1',
  clientId: 'client-1',
  clientName: 'Acme Bakery',
  clientLogoUrl: null,
  platforms: ['google', 'meta'],
  status: 'launched',
  businessDescription: 'Summer promo',
  budgetUsd: 500,
  goals: 'Traffic',
  guardrailFlagCount: 0,
  hasBlockingFlags: false,
  createdAt: '2026-07-01T00:00:00Z',
  launches: [
    {
      platform: 'google',
      status: 'success',
      externalCampaignId: 'g-1',
      errorMessage: null,
      attemptedAt: '2026-07-09T12:00:00Z',
    },
    {
      platform: 'meta',
      status: 'success',
      externalCampaignId: '987654321',
      errorMessage: null,
      attemptedAt: '2026-07-09T12:05:00Z',
    },
  ],
}

describe('LaunchedCampaignsPage', () => {
  it('lists launched campaigns with platform manage links and archives a row', async () => {
    let drafts: DraftSummary[] = [LAUNCHED, { ...LAUNCHED, id: 'draft-2', status: 'adapted', launches: [] }]
    const archiveDraft = vi.fn(async () => {
      drafts = drafts.filter((draft) => draft.id !== 'draft-1')
      return LAUNCHED
    })
    const apiClient = createFakeApiClient({
      listBriefs: async () => drafts,
      listClients: async () => [
        {
          id: 'client-1',
          name: 'Acme Bakery',
          googleAdsCustomerId: null,
          metaAdAccountId: 'act_111',
          googleConnected: false,
          metaConnected: true,
          logoUrl: null,
        },
      ],
      archiveDraft,
    })

    renderWithProviders(<LaunchedCampaignsPage />, {
      apiClient,
      path: '/launched',
      initialEntries: ['/launched'],
    })

    expect(await screen.findByText('Acme Bakery')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /google ads/i })).toHaveAttribute(
      'href',
      'https://ads.google.com/aw/overview',
    )
    expect(screen.getByRole('link', { name: /meta ads manager/i })).toHaveAttribute(
      'href',
      'https://business.facebook.com/adsmanager/manage/campaigns?act=act_111&selected_campaign_ids=987654321',
    )

    await userEvent.click(screen.getByRole('button', { name: /archive/i }))
    await waitFor(() => expect(archiveDraft).toHaveBeenCalledWith('draft-1'))
    await waitFor(() => expect(screen.queryByText('Acme Bakery')).not.toBeInTheDocument())
  })

  it('shows an empty state when nothing is launched', async () => {
    const apiClient = createFakeApiClient({
      listBriefs: async () => [],
      listClients: async () => [],
    })

    renderWithProviders(<LaunchedCampaignsPage />, {
      apiClient,
      path: '/launched',
      initialEntries: ['/launched'],
    })

    expect(await screen.findByText(/no launched campaigns yet/i)).toBeInTheDocument()
  })
})
