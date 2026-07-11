import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NewBriefPage } from './NewBriefPage'
import { createFakeApiClient } from '../test/fakeApiClient'
import { renderWithProviders } from '../test/renderWithProviders'
import type { Client, DraftSummary, GenerateResult } from '../lib/types'

const CLIENTS: Client[] = [
  {
    id: 'client-1',
    name: 'Acme Bakery',
    googleAdsCustomerId: null,
    metaAdAccountId: null,
    googleConnected: false,
    metaConnected: false,
  },
]

describe('NewBriefPage', () => {
  it('submits a batch brief for the selected client and generates it', async () => {
    const draft: DraftSummary = {
      id: 'draft-1',
      briefId: 'brief-1',
      clientId: 'client-1',
      clientName: 'Acme Bakery',
      status: 'pending_generation',
      businessDescription: 'Local bakery',
      budgetUsd: 500,
      goals: 'Drive traffic',
      guardrailFlagCount: 0,
      hasBlockingFlags: false,
      createdAt: '2026-07-09T00:00:00Z',
    }
    const generated: GenerateResult = {
      id: draft.id,
      briefId: draft.briefId,
      status: 'adapted',
      mode: 'demo',
      googlePlan: { campaignName: 'Bakery', dailyBudgetMicros: 0, endDate: null, adGroups: [] },
      metaPlan: { campaignName: 'Bakery', objective: 'traffic', adSets: [] },
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
    await userEvent.type(screen.getByLabelText('Budget (USD)'), '500')
    await userEvent.type(screen.getByLabelText('Goals'), 'Drive traffic')

    await userEvent.click(screen.getByRole('button', { name: /generate 1 campaign/i }))

    await waitFor(() =>
      expect(submitBriefsBatch).toHaveBeenCalledWith([
        { clientId: 'client-1', businessDescription: 'Local bakery', budgetUsd: 500, goals: 'Drive traffic' },
      ]),
    )
    await waitFor(() => expect(generateDraft).toHaveBeenCalledWith('draft-1'))
  })

  it('does not show the brief fields until a client is selected', async () => {
    const apiClient = createFakeApiClient({ listClients: async () => CLIENTS })
    renderWithProviders(<NewBriefPage />, { apiClient })

    await screen.findByLabelText('Include Acme Bakery')
    expect(screen.queryByLabelText('Business description')).not.toBeInTheDocument()
  })
})
