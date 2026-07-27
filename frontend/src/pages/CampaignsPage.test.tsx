import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { CampaignsPage } from './CampaignsPage'
import { createFakeApiClient } from '../test/fakeApiClient'
import { renderWithProviders } from '../test/renderWithProviders'
import type { DraftSummary } from '../lib/types'

const DRAFTS: DraftSummary[] = [
  {
    id: 'draft-1',
    briefId: 'brief-1',
    clientId: 'client-1',
    clientName: 'Acme Bakery',
    clientLogoUrl: null,
    platforms: ['google'],
    status: 'adapted',
    businessDescription: 'Bakery',
    budgetUsd: 500,
    goals: 'Traffic',
    guardrailFlagCount: 0,
    hasBlockingFlags: false,
    createdAt: '2026-07-09T00:00:00Z',
  },
  {
    id: 'draft-2',
    briefId: 'brief-2',
    clientId: 'client-2',
    clientName: 'Acme Plumbing',
    clientLogoUrl: null,
    platforms: ['google', 'meta'],
    status: 'launched',
    businessDescription: 'Plumbing',
    budgetUsd: 800,
    goals: 'Leads',
    guardrailFlagCount: 0,
    hasBlockingFlags: false,
    createdAt: '2026-07-08T00:00:00Z',
  },
]

const ONE_CLIENT = [
  { id: 'client-1', name: 'Acme Bakery', googleAdsCustomerId: null, metaAdAccountId: null, googleConnected: false, metaConnected: false, logoUrl: null },
]

describe('CampaignsPage', () => {
  it('renders all drafts and filters by status', async () => {
    const apiClient = createFakeApiClient({ listBriefs: async () => DRAFTS, listClients: async () => ONE_CLIENT })
    renderWithProviders(<CampaignsPage />, { apiClient })

    expect(await screen.findByText('Acme Bakery')).toBeInTheDocument()
    expect(screen.getByText('Acme Plumbing')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Filter by status'), 'launched')

    expect(screen.queryByText('Acme Bakery')).not.toBeInTheDocument()
    expect(screen.getByText('Acme Plumbing')).toBeInTheDocument()
  })

  it('guides a brand-new agency to add a client first when there are no clients yet', async () => {
    const apiClient = createFakeApiClient({ listBriefs: async () => [], listClients: async () => [] })
    renderWithProviders(<CampaignsPage />, { apiClient })

    expect(await screen.findByText('Add your first client')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /add client/i }).length).toBeGreaterThan(0)
  })

  it('guides an agency with clients but no briefs to create one', async () => {
    const apiClient = createFakeApiClient({ listBriefs: async () => [], listClients: async () => ONE_CLIENT })
    renderWithProviders(<CampaignsPage />, { apiClient })

    expect(await screen.findByText('Create your first brief')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /new brief/i }).length).toBeGreaterThan(0)
  })

  it('still shows the plain filter-empty message when drafts exist but none match', async () => {
    const apiClient = createFakeApiClient({ listBriefs: async () => DRAFTS, listClients: async () => ONE_CLIENT })
    renderWithProviders(<CampaignsPage />, { apiClient })

    await screen.findByText('Acme Bakery')
    await userEvent.selectOptions(screen.getByLabelText('Filter by status'), 'rejected')

    expect(screen.getByText('No campaigns match this filter yet.')).toBeInTheDocument()
    expect(screen.queryByText('Add your first client')).not.toBeInTheDocument()
  })

  it('shows summary stats across clients and campaign statuses', async () => {
    const clients = [
      ...ONE_CLIENT,
      { id: 'client-2', name: 'Acme Plumbing', googleAdsCustomerId: null, metaAdAccountId: null, googleConnected: false, metaConnected: false, logoUrl: null },
    ]
    const drafts: DraftSummary[] = [
      { ...DRAFTS[0], status: 'approved' },
      { ...DRAFTS[1], status: 'launched' },
      { ...DRAFTS[1], id: 'draft-3', status: 'failed' },
    ]
    const apiClient = createFakeApiClient({ listBriefs: async () => drafts, listClients: async () => clients })
    renderWithProviders(<CampaignsPage />, { apiClient })

    await screen.findByText('Acme Bakery')

    const stats = screen.getByRole('region', { name: /campaign summary/i })
    expect(within(stats).getByText('2')).toBeInTheDocument() // clients
    expect(within(stats).getAllByText('1')).toHaveLength(3) // awaiting review, needs attention, launched
  })

  it('shows the impact stat row once campaigns have launched', async () => {
    const apiClient = createFakeApiClient({
      listBriefs: async () => DRAFTS,
      listClients: async () => ONE_CLIENT,
      getImpactStats: async () => ({ campaignsLaunched: 3, estimatedHoursSaved: 6, guardrailIssuesCaught: 5 }),
    })
    renderWithProviders(<CampaignsPage />, { apiClient })

    const impact = await screen.findByRole('region', { name: /impact/i })
    expect(within(impact).getByText('6')).toBeInTheDocument()
    expect(within(impact).getByText('5')).toBeInTheDocument()
  })

  it('does not show the impact stat row when no campaigns have launched', async () => {
    const apiClient = createFakeApiClient({
      listBriefs: async () => DRAFTS,
      listClients: async () => ONE_CLIENT,
      getImpactStats: async () => ({ campaignsLaunched: 0, estimatedHoursSaved: 0, guardrailIssuesCaught: 0 }),
    })
    renderWithProviders(<CampaignsPage />, { apiClient })

    await screen.findByText('Acme Bakery')

    expect(screen.queryByRole('region', { name: /impact/i })).not.toBeInTheDocument()
  })
})
