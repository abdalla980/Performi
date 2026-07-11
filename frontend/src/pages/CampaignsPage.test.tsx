import { screen } from '@testing-library/react'
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
    status: 'launched',
    businessDescription: 'Plumbing',
    budgetUsd: 800,
    goals: 'Leads',
    guardrailFlagCount: 0,
    hasBlockingFlags: false,
    createdAt: '2026-07-08T00:00:00Z',
  },
]

describe('CampaignsPage', () => {
  it('renders all drafts and filters by status', async () => {
    const apiClient = createFakeApiClient({ listBriefs: async () => DRAFTS })
    renderWithProviders(<CampaignsPage />, { apiClient })

    expect(await screen.findByText('Acme Bakery')).toBeInTheDocument()
    expect(screen.getByText('Acme Plumbing')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Filter by status'), 'launched')

    expect(screen.queryByText('Acme Bakery')).not.toBeInTheDocument()
    expect(screen.getByText('Acme Plumbing')).toBeInTheDocument()
  })
})
