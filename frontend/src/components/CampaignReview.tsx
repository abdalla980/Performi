import { useState } from 'react'
import type { GoogleCampaignPlan } from '../lib/types'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'

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
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>{plan.campaignName}</CardTitle>
        <CardDescription>${dailyBudgetUsd.toFixed(2)}/day</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {plan.adGroups.map((adGroup) => (
          <div key={adGroup.name} className="rounded-md border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground">{adGroup.name}</h3>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {adGroup.keywords.map((keyword) => (
                <Badge key={keyword}>{keyword}</Badge>
              ))}
            </div>

            <div className="mt-3 flex flex-col gap-1">
              {adGroup.headlines.map((headline) => (
                <p key={headline} className="text-sm font-medium text-foreground">
                  {headline}
                </p>
              ))}
            </div>

            <div className="mt-1 flex flex-col gap-1">
              {adGroup.descriptions.map((description) => (
                <p key={description} className="text-sm text-muted-foreground">
                  {description}
                </p>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
      <CardFooter>
        <Button type="button" onClick={handleLaunch} disabled={launching}>
          {launching ? 'Launching…' : 'Launch'}
        </Button>
      </CardFooter>
    </Card>
  )
}
