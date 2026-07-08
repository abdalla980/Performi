import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { LaunchResult } from './LaunchResult'

describe('LaunchResult', () => {
  it('shows a success message with the external campaign id when launched', () => {
    render(
      <LaunchResult result={{ status: 'launched', externalCampaignId: 'google-camp-1', errorMessage: null }} />,
    )

    expect(screen.getByText(/campaign is live/i)).toBeInTheDocument()
    expect(screen.getByText(/google-camp-1/)).toBeInTheDocument()
  })

  it('shows the error message when launch failed', () => {
    render(
      <LaunchResult
        result={{ status: 'failed', externalCampaignId: null, errorMessage: 'quota exceeded' }}
      />,
    )

    expect(screen.getByText(/launch failed/i)).toBeInTheDocument()
    expect(screen.getByText(/quota exceeded/)).toBeInTheDocument()
  })
})
