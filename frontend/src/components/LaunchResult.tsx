import { CheckCircle2, XCircle } from 'lucide-react'
import type { LaunchResult as LaunchResultData } from '../lib/types'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'

interface LaunchResultProps {
  result: LaunchResultData
}

export function LaunchResult({ result }: LaunchResultProps) {
  if (result.status === 'launched') {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <CheckCircle2 className="h-10 w-10 text-success" />
          <CardTitle>Campaign launched</CardTitle>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          <p>
            Campaign is live. Google Ads campaign ID: <span className="font-medium text-foreground">{result.externalCampaignId}</span>
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="items-center text-center">
        <XCircle className="h-10 w-10 text-destructive" />
        <CardTitle>Couldn't launch campaign</CardTitle>
      </CardHeader>
      <CardContent className="text-center text-sm text-muted-foreground" role="alert">
        <p>Launch failed: {result.errorMessage}</p>
      </CardContent>
    </Card>
  )
}
