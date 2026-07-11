import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DraftDetailPage } from './DraftDetailPage'
import { createFakeApiClient } from '../test/fakeApiClient'
import { renderWithProviders } from '../test/renderWithProviders'
import type { DraftDetail, GuardrailReport, LaunchResponse } from '../lib/types'

function baseDraft(overrides: Partial<DraftDetail> = {}): DraftDetail {
  return {
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
    googlePlan: { campaignName: 'Austin Bakery', dailyBudgetMicros: 16_500_000, endDate: null, adGroups: [] },
    metaPlan: { campaignName: 'Austin Bakery', objective: 'traffic', adSets: [] },
    guardrail: null,
    launches: [],
    ...overrides,
  }
}

describe('DraftDetailPage', () => {
  it('runs guardrails, then approves and launches once clean', async () => {
    let draft = baseDraft()
    const guardrail: GuardrailReport = { id: 'gr-1', campaignDraftId: 'draft-1', flags: [], hasBlockingFlags: false }
    const launch: LaunchResponse = {
      status: 'launched',
      externalCampaignId: 'g-1',
      errorMessage: null,
      platforms: [{ platform: 'google', status: 'success', externalCampaignId: 'g-1', errorMessage: null }],
    }

    const getBrief = vi.fn(async () => draft)
    const runGuardrails = vi.fn(async () => {
      draft = { ...draft, status: 'guardrail_checked', guardrail, hasBlockingFlags: false }
      return guardrail
    })
    const approveDraft = vi.fn(async () => {
      draft = { ...draft, status: 'approved' }
      return { status: 'approved' }
    })
    const launchDraft = vi.fn(async () => {
      draft = { ...draft, status: 'launched', launches: launch.platforms }
      return launch
    })

    const apiClient = createFakeApiClient({ getBrief, runGuardrails, approveDraft, launchDraft })

    renderWithProviders(<DraftDetailPage />, {
      apiClient,
      path: '/campaigns/:draftId',
      initialEntries: ['/campaigns/draft-1'],
    })

    await screen.findByText('Acme Bakery')

    await userEvent.click(screen.getByRole('button', { name: /run guardrails/i }))
    await waitFor(() => expect(runGuardrails).toHaveBeenCalledWith('draft-1'))

    await userEvent.click(await screen.findByRole('button', { name: /^approve$/i }))
    await waitFor(() => expect(approveDraft).toHaveBeenCalled())

    await userEvent.click(await screen.findByRole('button', { name: /^launch$/i }))
    await waitFor(() => expect(launchDraft).toHaveBeenCalledWith('draft-1'))

    expect(await screen.findByText(/Campaign ID: g-1/)).toBeInTheDocument()
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
})
