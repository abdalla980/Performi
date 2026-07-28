import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DraftDetailPage } from './DraftDetailPage'
import { createFakeApiClient } from '../test/fakeApiClient'
import { renderWithProviders } from '../test/renderWithProviders'
import type { DraftDetail, GuardrailReport, LaunchResponse } from '../lib/types'
import { emptyGooglePlan, emptyMetaPlan } from '../test/planFixtures'

function baseDraft(overrides: Partial<DraftDetail> = {}): DraftDetail {
  return {
    id: 'draft-1',
    briefId: 'brief-1',
    clientId: 'client-1',
    clientName: 'Acme Bakery',
    clientLogoUrl: null,
    status: 'adapted',
    businessDescription: 'Bakery',
    budgetUsd: 500,
    goals: 'Traffic',
    guardrailFlagCount: 0,
    hasBlockingFlags: false,
    createdAt: '2026-07-09T00:00:00Z',
    websiteUrl: null,
    targetLocation: null,
    targetAudience: null,
    endDate: null,
    platforms: ['google', 'meta'],
    competitors: null,
    uniqueSellingPoints: null,
    excludedKeywords: [],
    servicesOffered: [],
    trustSignals: [],
    audienceHints: [],
    googlePlan: emptyGooglePlan(),
    metaPlan: emptyMetaPlan(),
    guardrail: null,
    launches: [],
    projectedMetrics: null,
    ...overrides,
  }
}

describe('DraftDetailPage', () => {
  it('runs guardrails, then approves, and awaits client approval before launch is offered', async () => {
    let draft = baseDraft()
    const guardrail: GuardrailReport = { id: 'gr-1', campaignDraftId: 'draft-1', flags: [], hasBlockingFlags: false }

    const getBrief = vi.fn(async () => draft)
    const runGuardrails = vi.fn(async () => {
      draft = { ...draft, status: 'guardrail_checked', guardrail, hasBlockingFlags: false }
      return guardrail
    })
    const approveDraft = vi.fn(async () => {
      draft = { ...draft, status: 'approved' }
      return { status: 'approved' }
    })

    const apiClient = createFakeApiClient({ getBrief, runGuardrails, approveDraft })

    renderWithProviders(<DraftDetailPage />, {
      apiClient,
      path: '/campaigns/:draftId',
      initialEntries: ['/campaigns/draft-1'],
    })

    await screen.findByText('Acme Bakery')

    await userEvent.click(screen.getByRole('button', { name: /run compliance check/i }))
    await waitFor(() => expect(runGuardrails).toHaveBeenCalledWith('draft-1'))

    await userEvent.click(await screen.findByRole('button', { name: /^approve$/i }))
    await waitFor(() => expect(approveDraft).toHaveBeenCalled())

    expect(await screen.findByText(/awaiting the client's approval/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^launch$/i })).not.toBeInTheDocument()
  })

  it('lets the agency approve as client when the client is demo-only', async () => {
    let draft = baseDraft({ status: 'approved' })
    const actAsClient = vi.fn(async () => {
      draft = { ...draft, status: 'client_approved' }
      return { status: 'client_approved' }
    })
    const apiClient = createFakeApiClient({
      getBrief: async () => draft,
      getClient: async () => ({
        id: 'client-1',
        name: 'Acme Bakery',
        googleAdsCustomerId: 'demo-abcd1234',
        metaAdAccountId: null,
        googleConnected: true,
        metaConnected: false,
        logoUrl: null,
        brandVoice: null,
        assets: [],
      }),
      actAsClient,
    })

    renderWithProviders(<DraftDetailPage />, {
      apiClient,
      path: '/campaigns/:draftId',
      initialEntries: ['/campaigns/draft-1'],
    })

    expect(await screen.findByRole('button', { name: /approve as client \(demo\)/i })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /approve as client \(demo\)/i }))
    await waitFor(() => expect(actAsClient).toHaveBeenCalledWith('draft-1', 'approved'))
    expect(await screen.findByRole('button', { name: /^launch$/i })).toBeInTheDocument()
  })

  it('hides approve-as-client when the client has a live ad account', async () => {
    const draft = baseDraft({ status: 'approved' })
    const apiClient = createFakeApiClient({
      getBrief: async () => draft,
      getClient: async () => ({
        id: 'client-1',
        name: 'Acme Bakery',
        googleAdsCustomerId: '123-456-7890',
        metaAdAccountId: null,
        googleConnected: true,
        metaConnected: false,
        logoUrl: null,
        brandVoice: null,
        assets: [],
      }),
    })

    renderWithProviders(<DraftDetailPage />, {
      apiClient,
      path: '/campaigns/:draftId',
      initialEntries: ['/campaigns/draft-1'],
    })

    expect(await screen.findByText(/awaiting the client's approval/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /approve as client/i })).not.toBeInTheDocument()
  })

  it('shows the launch button once the client has approved, and launches', async () => {
    const draft = baseDraft({ status: 'client_approved' })
    const launch: LaunchResponse = {
      status: 'launched',
      externalCampaignId: 'g-1',
      errorMessage: null,
      platforms: [
        { platform: 'google', status: 'success', externalCampaignId: 'g-1', errorMessage: null, attemptedAt: '2026-07-18T00:00:00Z' },
      ],
    }
    const launchDraft = vi.fn().mockResolvedValue(launch)
    const apiClient = createFakeApiClient({ getBrief: async () => draft, launchDraft })

    renderWithProviders(<DraftDetailPage />, {
      apiClient,
      path: '/campaigns/:draftId',
      initialEntries: ['/campaigns/draft-1'],
    })

    await userEvent.click(await screen.findByRole('button', { name: /^launch$/i }))
    await waitFor(() => expect(launchDraft).toHaveBeenCalledWith('draft-1'))
  })

  it('offers a retry once a launch has failed', async () => {
    const draft = baseDraft({
      status: 'failed',
      launches: [
        {
          platform: 'google',
          status: 'failed',
          externalCampaignId: null,
          errorMessage: 'quota exceeded',
          attemptedAt: '2026-07-18T00:00:00Z',
        },
      ],
    })
    const launch: LaunchResponse = {
      status: 'launched',
      externalCampaignId: 'g-2',
      errorMessage: null,
      platforms: [
        { platform: 'google', status: 'success', externalCampaignId: 'g-2', errorMessage: null, attemptedAt: '2026-07-18T00:00:00Z' },
      ],
    }
    const launchDraft = vi.fn().mockResolvedValue(launch)
    const apiClient = createFakeApiClient({ getBrief: async () => draft, launchDraft })

    renderWithProviders(<DraftDetailPage />, {
      apiClient,
      path: '/campaigns/:draftId',
      initialEntries: ['/campaigns/draft-1'],
    })

    await userEvent.click(await screen.findByRole('button', { name: /retry launch/i }))
    await waitFor(() => expect(launchDraft).toHaveBeenCalledWith('draft-1'))
  })

  it('labels a demo-mode launch as simulated instead of linking to the real platform', async () => {
    const draft = baseDraft({
      status: 'launched',
      launches: [
        {
          platform: 'google',
          status: 'success',
          externalCampaignId: 'demo-google-demo-05cc4121',
          errorMessage: null,
          attemptedAt: '2026-07-18T12:00:00Z',
        },
      ],
    })
    const apiClient = createFakeApiClient({ getBrief: async () => draft })

    renderWithProviders(<DraftDetailPage />, {
      apiClient,
      path: '/campaigns/:draftId',
      initialEntries: ['/campaigns/draft-1'],
    })

    await screen.findByText('Acme Bakery')
    expect(screen.getAllByText(/simulated/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: /view in google ads/i })).not.toBeInTheDocument()
  })

  it('links to the real platform for a genuine launch', async () => {
    const draft = baseDraft({
      status: 'launched',
      launches: [
        {
          platform: 'google',
          status: 'success',
          externalCampaignId: 'customers/123/campaigns/456',
          errorMessage: null,
          attemptedAt: '2026-07-18T12:00:00Z',
        },
      ],
    })
    const apiClient = createFakeApiClient({ getBrief: async () => draft })

    renderWithProviders(<DraftDetailPage />, {
      apiClient,
      path: '/campaigns/:draftId',
      initialEntries: ['/campaigns/draft-1'],
    })

    await screen.findByText('Acme Bakery')
    const link = screen.getByRole('link', { name: /view in google ads/i })
    expect(link).toHaveAttribute('href', 'https://ads.google.com/aw/overview')
    expect(link).toHaveAttribute('target', '_blank')
    expect(screen.queryByText(/simulated/i)).not.toBeInTheDocument()
  })

  it('deep-links Meta launches to the specific campaign when the ad account is known', async () => {
    const draft = baseDraft({
      status: 'launched',
      platforms: ['meta'],
      launches: [
        {
          platform: 'meta',
          status: 'success',
          externalCampaignId: '987654321',
          errorMessage: null,
          attemptedAt: '2026-07-18T12:00:00Z',
        },
      ],
    })
    const apiClient = createFakeApiClient({
      getBrief: async () => draft,
      getClient: async () => ({
        id: 'client-1',
        name: 'Acme Bakery',
        googleAdsCustomerId: null,
        metaAdAccountId: 'act_111',
        googleConnected: false,
        metaConnected: true,
        logoUrl: null,
        brandVoice: null,
        assets: [],
      }),
    })

    renderWithProviders(<DraftDetailPage />, {
      apiClient,
      path: '/campaigns/:draftId',
      initialEntries: ['/campaigns/draft-1'],
    })

    await screen.findByText('Acme Bakery')
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /view in meta ads manager/i })).toHaveAttribute(
        'href',
        'https://business.facebook.com/adsmanager/manage/campaigns?act=act_111&selected_campaign_ids=987654321',
      )
    })
  })

  it('disables approve when the guardrail report has blocking flags', async () => {
    const draft = baseDraft({
      status: 'guardrail_checked',
      hasBlockingFlags: true,
      guardrail: {
        id: 'gr-1',
        campaignDraftId: 'draft-1',
        flags: [{ severity: 'block', code: 'banned_term', message: 'Uses a banned term.' }],
        hasBlockingFlags: true,
      },
    })
    const apiClient = createFakeApiClient({ getBrief: async () => draft })

    renderWithProviders(<DraftDetailPage />, {
      apiClient,
      path: '/campaigns/:draftId',
      initialEntries: ['/campaigns/draft-1'],
    })

    expect(await screen.findByText('Uses a banned term.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeDisabled()
  })

  it('shows the extended brief details and plan-level extras when present', async () => {
    const draft = baseDraft({
      websiteUrl: 'https://acmebakery.test',
      targetLocation: 'Austin, TX',
      targetAudience: 'Families within 5 miles',
      endDate: '2026-12-31',
      platforms: ['google'],
      competitors: 'Big Bakery Co',
      uniqueSellingPoints: 'Family recipes since 1990',
      excludedKeywords: ['free', 'cheap'],
      servicesOffered: [],
      trustSignals: [],
      audienceHints: [],
      googlePlan: emptyGooglePlan({
        finalUrl: 'https://acmebakery.test',
        negativeKeywords: ['free', 'cheap'],
      }),
      metaPlan: null,
    })
    const apiClient = createFakeApiClient({ getBrief: async () => draft })

    renderWithProviders(<DraftDetailPage />, {
      apiClient,
      path: '/campaigns/:draftId',
      initialEntries: ['/campaigns/draft-1'],
    })

    await screen.findByText('Acme Bakery')

    expect(screen.getByText('Austin, TX')).toBeInTheDocument()
    expect(screen.getByText('Families within 5 miles')).toBeInTheDocument()
    expect(screen.getByText('2026-12-31')).toBeInTheDocument()
    expect(screen.getByText('Big Bakery Co')).toBeInTheDocument()
    expect(screen.getByText('Family recipes since 1990')).toBeInTheDocument()
    expect(screen.getByText('free, cheap')).toBeInTheDocument()
    expect(screen.getAllByText('Google Ads').length).toBeGreaterThan(0)
    expect(screen.getAllByText('https://acmebakery.test').length).toBeGreaterThan(0)
  })

  it('shows projected performance stat tiles and a per-platform chart when present', async () => {
    const draft = baseDraft({
      platforms: ['google', 'meta'],
      projectedMetrics: {
        platforms: [
          { platform: 'google', dailyBudgetUsd: 10, estimatedDailyClicks: 5, estimatedDailyImpressions: 250 },
          { platform: 'meta', dailyBudgetUsd: 10, estimatedDailyClicks: 10, estimatedDailyImpressions: 1000 },
        ],
        estimatedLocationReach: 37500,
      },
    })
    const apiClient = createFakeApiClient({ getBrief: async () => draft })

    renderWithProviders(<DraftDetailPage />, {
      apiClient,
      path: '/campaigns/:draftId',
      initialEntries: ['/campaigns/draft-1'],
    })

    await screen.findByText('Projected performance')

    expect(screen.getByText('1.3K')).toBeInTheDocument()
    expect(screen.getByText('15')).toBeInTheDocument()
    expect(screen.getByText('37.5K')).toBeInTheDocument()
    expect(screen.getByText(/5 clicks/)).toBeInTheDocument()
    expect(screen.getByText(/10 clicks/)).toBeInTheDocument()
  })

  it('omits the projected performance section when there is no projected data yet', async () => {
    const draft = baseDraft({ projectedMetrics: null })
    const apiClient = createFakeApiClient({ getBrief: async () => draft })

    renderWithProviders(<DraftDetailPage />, {
      apiClient,
      path: '/campaigns/:draftId',
      initialEntries: ['/campaigns/draft-1'],
    })

    await screen.findByText('Acme Bakery')
    expect(screen.queryByText('Projected performance')).not.toBeInTheDocument()
  })

  it('shows a share-summary link once the campaign is client-approved or later', async () => {
    const draft = baseDraft({ status: 'launched' })
    const apiClient = createFakeApiClient({ getBrief: async () => draft })
    renderWithProviders(<DraftDetailPage />, {
      apiClient,
      path: '/campaigns/:draftId',
      initialEntries: ['/campaigns/draft-1'],
    })

    const link = await screen.findByRole('link', { name: /share summary/i })
    expect(link).toHaveAttribute('href', '/campaigns/draft-1/summary')
  })

  it('hides the share-summary link before the client has approved', async () => {
    const draft = baseDraft({ status: 'adapted' })
    const apiClient = createFakeApiClient({ getBrief: async () => draft })
    renderWithProviders(<DraftDetailPage />, {
      apiClient,
      path: '/campaigns/:draftId',
      initialEntries: ['/campaigns/draft-1'],
    })

    await screen.findByText('Acme Bakery')
    expect(screen.queryByRole('link', { name: /share summary/i })).not.toBeInTheDocument()
  })
})
