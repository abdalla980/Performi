import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NewBriefPage } from './NewBriefPage'
import { createFakeApiClient } from '../test/fakeApiClient'
import { renderWithProviders } from '../test/renderWithProviders'
import type { Client, DraftDetail, DraftSummary, GenerateResult } from '../lib/types'
import { emptyGooglePlan, emptyMetaPlan } from '../test/planFixtures'

const CLIENTS: Client[] = [
  {
    id: 'client-1',
    name: 'Acme Bakery',
    googleAdsCustomerId: null,
    metaAdAccountId: null,
    googleConnected: false,
    metaConnected: false,
    logoUrl: null,
  },
]

describe('NewBriefPage', () => {
  it('submits a batch brief for the selected client and generates it', async () => {
    const draft: DraftSummary = {
      id: 'draft-1',
      briefId: 'brief-1',
      clientId: 'client-1',
      clientName: 'Acme Bakery',
      clientLogoUrl: null,
      platforms: ['google'],
      status: 'pending_generation',
      businessDescription: 'Local bakery',
      budgetUsd: 500,
      goals: 'Drive traffic',
      guardrailFlagCount: 0,
      hasBlockingFlags: false,
      createdAt: '2026-07-09T00:00:00Z',
      launches: [],
    }
    const generated: GenerateResult = {
      id: draft.id,
      briefId: draft.briefId,
      status: 'adapted',
      mode: 'demo',
      googlePlan: emptyGooglePlan({ campaignName: 'Bakery', dailyBudgetMicros: 0 }),
      metaPlan: emptyMetaPlan({ campaignName: 'Bakery' }),
    }

    const submitBriefsBatch = vi.fn().mockResolvedValue([draft])
    const generateDraft = vi.fn().mockResolvedValue(generated)
    const apiClient = createFakeApiClient({
      listClients: async () => CLIENTS,
      submitBriefsBatch,
      generateDraft,
    })

    renderWithProviders(<NewBriefPage />, { apiClient })

    await userEvent.click(await screen.findByLabelText('Include Acme Bakery'))
    await userEvent.type(screen.getByLabelText('Business description'), 'Local bakery')
    await userEvent.type(screen.getByLabelText('Budget (USD/month)'), '500')
    await userEvent.type(screen.getByLabelText('Goals'), 'Drive traffic')

    await userEvent.click(screen.getByRole('button', { name: /generate 1 campaign/i }))

    await waitFor(() =>
      expect(submitBriefsBatch).toHaveBeenCalledWith([
        {
          clientId: 'client-1',
          businessDescription: 'Local bakery',
          budgetUsd: 500,
          goals: 'Drive traffic',
          platforms: ['google', 'meta'],
        },
      ]),
    )
    await waitFor(() => expect(generateDraft).toHaveBeenCalledWith('draft-1'))
  })

  it('submits the extended targeting/scheduling fields and respects platform selection', async () => {
    // Nine sequential userEvent.type() calls across many fields is genuinely borderline
    // on the 5000ms default under full-suite parallel load (verified: reliable in
    // isolation, intermittently timing out under load throughout this session) --
    // give it real headroom rather than keep re-triggering a known-slow-not-broken test.
    const draft: DraftSummary = {
      id: 'draft-2',
      briefId: 'brief-2',
      clientId: 'client-1',
      clientName: 'Acme Bakery',
      clientLogoUrl: null,
      platforms: ['google'],
      status: 'pending_generation',
      businessDescription: 'Local bakery',
      budgetUsd: 500,
      goals: 'Drive traffic',
      guardrailFlagCount: 0,
      hasBlockingFlags: false,
      createdAt: '2026-07-09T00:00:00Z',
      launches: [],
    }
    const submitBriefsBatch = vi.fn().mockResolvedValue([draft])
    const generateDraft = vi.fn().mockResolvedValue({
      id: draft.id,
      briefId: draft.briefId,
      status: 'adapted',
      mode: 'demo',
      googlePlan: null,
      metaPlan: null,
    })
    const apiClient = createFakeApiClient({ listClients: async () => CLIENTS, submitBriefsBatch, generateDraft })

    renderWithProviders(<NewBriefPage />, { apiClient })

    await userEvent.click(await screen.findByLabelText('Include Acme Bakery'))
    await userEvent.type(screen.getByLabelText('Business description'), 'Local bakery')
    await userEvent.type(screen.getByLabelText('Budget (USD/month)'), '500')
    await userEvent.type(screen.getByLabelText('Goals'), 'Drive traffic')
    await userEvent.type(screen.getByLabelText('Website / landing page URL'), 'https://acmebakery.test')
    await userEvent.type(screen.getByLabelText('Target location'), 'Austin, TX')
    await userEvent.type(screen.getByLabelText('Target audience'), 'Families within 5 miles')
    await userEvent.type(screen.getByLabelText('Competitors'), 'Big Bakery Co')
    await userEvent.type(screen.getByLabelText('Unique selling points'), 'Family recipes since 1990')
    await userEvent.type(screen.getByLabelText(/Excluded\/negative keywords/i), 'free, cheap')
    fireEvent.change(screen.getByLabelText('Campaign end date (optional)'), { target: { value: '2026-12-31' } })
    await userEvent.click(screen.getByLabelText('Meta'))

    await userEvent.click(screen.getByRole('button', { name: /generate 1 campaign/i }))

    await waitFor(() =>
      expect(submitBriefsBatch).toHaveBeenCalledWith([
        {
          clientId: 'client-1',
          businessDescription: 'Local bakery',
          budgetUsd: 500,
          goals: 'Drive traffic',
          websiteUrl: 'https://acmebakery.test',
          targetLocation: 'Austin, TX',
          targetAudience: 'Families within 5 miles',
          endDate: '2026-12-31',
          platforms: ['google'],
          competitors: 'Big Bakery Co',
          uniqueSellingPoints: 'Family recipes since 1990',
          excludedKeywords: ['free', 'cheap'],
        },
      ]),
    )
  }, 15000)

  it('does not show the brief fields until a client is selected', async () => {
    const apiClient = createFakeApiClient({ listClients: async () => CLIENTS })
    renderWithProviders(<NewBriefPage />, { apiClient })

    await screen.findByLabelText('Include Acme Bakery')
    expect(screen.queryByLabelText('Business description')).not.toBeInTheDocument()
  })

  it('prefills a client row from an existing draft when duplicating for a refresh', async () => {
    const source: DraftDetail = {
      id: 'draft-1',
      briefId: 'brief-1',
      clientId: 'client-1',
      clientName: 'Acme Bakery',
      clientLogoUrl: null,
      platforms: ['google'],
      status: 'launched',
      businessDescription: 'Local bakery',
      budgetUsd: 500,
      goals: 'Drive traffic',
      guardrailFlagCount: 0,
      hasBlockingFlags: false,
      createdAt: '2026-05-01T00:00:00Z',
      websiteUrl: 'https://acme.test',
      targetLocation: 'Austin, TX',
      targetAudience: 'Homeowners',
      endDate: '2026-06-01',
      competitors: 'Big Bakery Co',
      uniqueSellingPoints: 'Fresh daily',
      excludedKeywords: ['free'],
      servicesOffered: ['Custom cakes'],
      trustSignals: ['Family-Owned'],
      audienceHints: [{ name: 'Locals', description: 'Nearby residents' }],
      googlePlan: null,
      metaPlan: null,
      guardrail: null,
      launches: [],
      projectedMetrics: null,
    }
    const apiClient = createFakeApiClient({ listClients: async () => CLIENTS, getBrief: async () => source })

    renderWithProviders(<NewBriefPage />, {
      apiClient,
      path: '/campaigns/new',
      initialEntries: ['/campaigns/new?duplicateFrom=draft-1'],
    })

    expect(await screen.findByDisplayValue('Local bakery')).toBeInTheDocument()
    expect(screen.getByDisplayValue('500')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Austin, TX')).toBeInTheDocument()
  })
})
