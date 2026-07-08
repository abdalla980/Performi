import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { App } from './App'
import type { ApiClient, CampaignDraft, GoogleCampaignPlan, LaunchResult } from './lib/types'

const PLAN: GoogleCampaignPlan = {
  campaignName: 'Austin Bakery Foot Traffic',
  dailyBudgetMicros: 16_500_000,
  adGroups: [
    {
      name: 'Austin Bakery Foot Traffic - Primary',
      keywords: ['bakery near me'],
      headlines: ['Fresh Pastries Daily'],
      descriptions: ['Visit today.'],
    },
  ],
}

function makeApiClient(overrides: Partial<ApiClient> = {}): ApiClient {
  const draft: CampaignDraft = { id: 'draft-1', briefId: 'brief-1', status: 'pending_generation', googlePlan: null }
  const generatedDraft: CampaignDraft = { ...draft, status: 'adapted', googlePlan: PLAN }
  const launchResult: LaunchResult = { status: 'launched', externalCampaignId: 'google-camp-1', errorMessage: null }

  return {
    submitBrief: vi.fn().mockResolvedValue(draft),
    generateDraft: vi.fn().mockResolvedValue(generatedDraft),
    launchDraft: vi.fn().mockResolvedValue(launchResult),
    ...overrides,
  }
}

describe('App', () => {
  it('walks from login through brief submission to a launched campaign', async () => {
    const user = userEvent.setup()
    const onLogin = vi.fn().mockResolvedValue(undefined)
    const apiClient = makeApiClient()

    render(<App apiClient={apiClient} onLogin={onLogin} clientId="client-1" />)

    await user.type(screen.getByLabelText(/email/i), 'owner@acme.test')
    await user.type(screen.getByLabelText(/password/i), 'correct horse')
    await user.click(screen.getByRole('button', { name: /log in/i }))
    await waitFor(() => expect(onLogin).toHaveBeenCalled())

    await screen.findByLabelText(/business description/i)
    await user.type(screen.getByLabelText(/business description/i), 'Local bakery in Austin')
    await user.type(screen.getByLabelText(/budget/i), '500')
    await user.type(screen.getByLabelText(/goal/i), 'Drive foot traffic')
    await user.click(screen.getByRole('button', { name: /generate campaign/i }))

    await screen.findByText('Austin Bakery Foot Traffic')
    expect(apiClient.submitBrief).toHaveBeenCalledWith({
      clientId: 'client-1',
      businessDescription: 'Local bakery in Austin',
      budgetUsd: 500,
      goals: 'Drive foot traffic',
    })
    expect(apiClient.generateDraft).toHaveBeenCalledWith('draft-1')

    await user.click(screen.getByRole('button', { name: /^launch$/i }))

    await screen.findByText(/campaign is live/i)
    expect(apiClient.launchDraft).toHaveBeenCalledWith('draft-1')
  })
})
