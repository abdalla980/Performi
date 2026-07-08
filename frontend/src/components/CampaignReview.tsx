import { useState } from 'react'
import type { GoogleCampaignPlan } from '../lib/types'

interface CampaignReviewProps {
  plan: GoogleCampaignPlan
  onLaunch: () => Promise<void>
}

export function CampaignReview({ plan, onLaunch }: CampaignReviewProps) {
  const [launching, setLaunching] = useState(false)
  const dailyBudgetUsd = plan.dailyBudgetMicros / 1_000_000

  const handleLaunch = async () => {
    setLaunching(true)
    try {
      await onLaunch()
    } finally {
      setLaunching(false)
    }
  }

  return (
    <div>
      <h2>{plan.campaignName}</h2>
      <p>${dailyBudgetUsd.toFixed(2)}/day</p>

      {plan.adGroups.map((adGroup) => (
        <div key={adGroup.name}>
          <h3>{adGroup.name}</h3>
          <ul>
            {adGroup.keywords.map((keyword) => (
              <li key={keyword}>{keyword}</li>
            ))}
          </ul>
          {adGroup.headlines.map((headline) => (
            <p key={headline}>{headline}</p>
          ))}
        </div>
      ))}

      <button type="button" onClick={handleLaunch} disabled={launching}>
        {launching ? 'Launching…' : 'Launch'}
      </button>
    </div>
  )
}
