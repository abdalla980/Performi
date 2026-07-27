import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '../lib/apiClientContext'
import { GooglePlanView, MetaPlanView } from '../components/CampaignPlanViews'
import { Alert } from '../components/ui/alert'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

export function ClientSummaryPage() {
  const { draftId = '' } = useParams<{ draftId: string }>()
  const apiClient = useApiClient()

  const {
    data: draft,
    isPending: isDraftPending,
    isError: isDraftError,
  } = useQuery({
    queryKey: ['briefs', draftId],
    queryFn: () => apiClient.getBrief(draftId),
    enabled: Boolean(draftId),
  })
  const { data: client } = useQuery({
    queryKey: ['clients', draft?.clientId],
    queryFn: () => apiClient.getClient(draft!.clientId),
    enabled: Boolean(draft?.clientId),
  })

  if (isDraftPending) {
    return <p className="p-8 text-sm text-muted-foreground">Loading summary…</p>
  }
  if (isDraftError || !draft) {
    return <Alert className="m-8">Couldn't load this campaign.</Alert>
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-8 print:p-0">
      <div className="flex items-center gap-3">
        {draft.clientLogoUrl && (
          <img
            src={`${API_BASE_URL}${draft.clientLogoUrl}`}
            alt={`${draft.clientName} logo`}
            className="h-12 w-12 rounded-md object-cover"
          />
        )}
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground">{draft.clientName}</h1>
          <p className="text-sm text-muted-foreground">{draft.businessDescription}</p>
        </div>
      </div>

      {client?.brandVoice?.tone && (
        <p className="text-sm italic text-muted-foreground">Brand voice: {client.brandVoice.tone}</p>
      )}

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Monthly budget</p>
          <p className="font-medium text-foreground">${draft.budgetUsd.toFixed(0)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Platforms</p>
          <p className="font-medium text-foreground">
            {draft.platforms.map((p) => (p === 'google' ? 'Google Ads' : 'Meta')).join(', ')}
          </p>
        </div>
        {draft.targetLocation && (
          <div>
            <p className="text-muted-foreground">Target location</p>
            <p className="font-medium text-foreground">{draft.targetLocation}</p>
          </div>
        )}
      </div>

      {draft.googlePlan && (
        <div>
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold text-foreground">Google Ads</h2>
            <span className="text-sm text-muted-foreground">{draft.googlePlan.campaignName}</span>
          </div>
          <GooglePlanView plan={draft.googlePlan} />
        </div>
      )}
      {draft.metaPlan && (
        <div>
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-sm font-semibold text-foreground">Meta</h2>
            <span className="text-sm text-muted-foreground">{draft.metaPlan.campaignName}</span>
          </div>
          <MetaPlanView plan={draft.metaPlan} />
        </div>
      )}
    </div>
  )
}
