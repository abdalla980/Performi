import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ClientSummaryPage } from './ClientSummaryPage'
import { createFakeApiClient } from '../test/fakeApiClient'
import { renderWithProviders } from '../test/renderWithProviders'
import type { ClientDetail, DraftDetail } from '../lib/types'
import { emptyGooglePlan } from '../test/planFixtures'

const DRAFT: DraftDetail = {
  id: 'draft-1',
  briefId: 'brief-1',
  clientId: 'client-1',
  clientName: 'Acme Bakery',
  clientLogoUrl: null,
  platforms: ['google'],
  status: 'launched',
  businessDescription: 'Local bakery in Austin',
  budgetUsd: 500,
  goals: 'Drive traffic',
  guardrailFlagCount: 0,
  hasBlockingFlags: false,
  createdAt: '2026-07-01T00:00:00Z',
  websiteUrl: 'https://acme.test',
  targetLocation: 'Austin, TX',
  targetAudience: 'Homeowners',
  endDate: null,
  competitors: 'Big Bakery Co',
  uniqueSellingPoints: 'Fresh daily',
  excludedKeywords: ['free'],
  googlePlan: emptyGooglePlan({
    campaignName: 'Bakery Campaign',
    dailyBudgetMicros: 16_000_000,
    finalUrl: 'https://acme.test',
  }),
  metaPlan: null,
  guardrail: {
    id: 'gr-1',
    campaignDraftId: 'draft-1',
    flags: [{ severity: 'block', code: 'banned_term', message: 'Uses a banned term.' }],
    hasBlockingFlags: true,
  },
  launches: [],
  projectedMetrics: null,
}

const CLIENT: ClientDetail = {
  id: 'client-1',
  name: 'Acme Bakery',
  googleAdsCustomerId: null,
  metaAdAccountId: null,
  googleConnected: false,
  metaConnected: false,
  logoUrl: null,
  brandVoice: { id: 'bv-1', clientId: 'client-1', tone: 'warm and friendly', bannedTerms: [], requiredDisclaimers: [], approvedOffers: [], sitelinks: [] },
  assets: [],
}

describe('ClientSummaryPage', () => {
  it('renders a client-facing summary without internal-only fields', async () => {
    const apiClient = createFakeApiClient({ getBrief: async () => DRAFT, getClient: async () => CLIENT })
    renderWithProviders(<ClientSummaryPage />, {
      apiClient,
      path: '/campaigns/:draftId/summary',
      initialEntries: ['/campaigns/draft-1/summary'],
    })

    expect(await screen.findByText('Acme Bakery')).toBeInTheDocument()
    expect(screen.getByText('Bakery Campaign')).toBeInTheDocument()
    expect(await screen.findByText(/warm and friendly/)).toBeInTheDocument()
    expect(screen.queryByText('Big Bakery Co')).not.toBeInTheDocument()
    expect(screen.queryByText('Fresh daily')).not.toBeInTheDocument()
    expect(screen.queryByText('free')).not.toBeInTheDocument()
    expect(screen.queryByText('Uses a banned term.')).not.toBeInTheDocument()
  })
})
