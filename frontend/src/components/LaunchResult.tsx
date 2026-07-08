import type { LaunchResult as LaunchResultData } from '../lib/types'

interface LaunchResultProps {
  result: LaunchResultData
}

export function LaunchResult({ result }: LaunchResultProps) {
  if (result.status === 'launched') {
    return (
      <p>
        Campaign is live. Google Ads campaign ID: {result.externalCampaignId}
      </p>
    )
  }

  return <p role="alert">Launch failed: {result.errorMessage}</p>
}
