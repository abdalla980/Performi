import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CampaignReview } from './CampaignReview'
import type { GoogleCampaignPlan } from '../lib/types'

const PLAN: GoogleCampaignPlan = {
  campaignName: 'Austin Bakery Foot Traffic',
  dailyBudgetMicros: 16_500_000,
  adGroups: [
    {
      name: 'Austin Bakery Foot Traffic - Primary',
      keywords: ['bakery near me', 'austin pastries'],
      headlines: ['Fresh Pastries Daily'],
      descriptions: ['Visit our Austin bakery today.'],
    },
  ],
}

describe('CampaignReview', () => {
  it('renders the campaign name, budget in dollars, keywords, and headlines', () => {
    render(<CampaignReview plan={PLAN} onLaunch={vi.fn()} />)

    expect(screen.getByText('Austin Bakery Foot Traffic')).toBeInTheDocument()
    expect(screen.getByText('$16.50/day')).toBeInTheDocument()
    expect(screen.getByText('bakery near me')).toBeInTheDocument()
    expect(screen.getByText('Fresh Pastries Daily')).toBeInTheDocument()
  })

  it('calls onLaunch when the Launch button is clicked', async () => {
    const user = userEvent.setup()
    const onLaunch = vi.fn().mockResolvedValue(undefined)
    render(<CampaignReview plan={PLAN} onLaunch={onLaunch} />)

    await user.click(screen.getByRole('button', { name: /^launch$/i }))

    await waitFor(() => {
      expect(onLaunch).toHaveBeenCalledTimes(1)
    })
  })

  it('disables the launch button while launching', async () => {
    const user = userEvent.setup()
    let resolveLaunch: () => void = () => {}
    const onLaunch = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveLaunch = resolve
        }),
    )
    render(<CampaignReview plan={PLAN} onLaunch={onLaunch} />)

    await user.click(screen.getByRole('button', { name: /^launch$/i }))

    expect(screen.getByRole('button', { name: /launching/i })).toBeDisabled()
    resolveLaunch()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^launch$/i })).not.toBeDisabled()
    })
  })
})
