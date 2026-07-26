import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useClientPortalApiClient } from '../lib/clientPortalApiClientContext'
import { STATUS_BADGE_VARIANT, STATUS_LABELS } from '../lib/statusDisplay'
import { GooglePlanView, MetaPlanView, ProjectedMetricsSection } from '../components/CampaignPlanViews'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'

const PLATFORM_LABEL: Record<'google' | 'meta', string> = { google: 'Google Ads', meta: 'Meta' }

export function ClientPortalCampaignDetailPage() {
  const { draftId = '' } = useParams<{ draftId: string }>()
  const apiClient = useClientPortalApiClient()
  const queryClient = useQueryClient()

  const campaignQueryKey = ['portal-campaigns', draftId] as const

  const {
    data: campaign,
    isPending,
    isError,
  } = useQuery({
    queryKey: campaignQueryKey,
    queryFn: () => apiClient.getCampaign(draftId),
    enabled: Boolean(draftId),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: campaignQueryKey })
    queryClient.invalidateQueries({ queryKey: ['portal-campaigns'] })
  }

  const approveMutation = useMutation({
    mutationFn: () => apiClient.decideCampaign(draftId, 'approved'),
    onSuccess: invalidate,
  })
  const rejectMutation = useMutation({
    mutationFn: () => apiClient.decideCampaign(draftId, 'rejected'),
    onSuccess: invalidate,
  })
  const flagIssueMutation = useMutation({ mutationFn: () => apiClient.flagLaunchIssue(draftId) })

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading campaign…</p>
  }
  if (isError || !campaign) {
    return <Alert>Couldn't load this campaign.</Alert>
  }

  const mutationError = approveMutation.error ?? rejectMutation.error

  const detailRows: Array<{ label: string; value: string; href?: string }> = [
    { label: 'Budget', value: `$${campaign.budgetUsd.toFixed(0)}/mo` },
    { label: 'Goals', value: campaign.goals },
  ]
  if (campaign.websiteUrl) detailRows.push({ label: 'Website', value: campaign.websiteUrl, href: campaign.websiteUrl })
  if (campaign.targetLocation) detailRows.push({ label: 'Target location', value: campaign.targetLocation })
  if (campaign.targetAudience) detailRows.push({ label: 'Target audience', value: campaign.targetAudience })
  if (campaign.endDate) detailRows.push({ label: 'End date', value: campaign.endDate })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-display text-xl font-semibold text-foreground">{campaign.businessDescription}</h1>
        <Badge variant={STATUS_BADGE_VARIANT[campaign.status]}>{STATUS_LABELS[campaign.status]}</Badge>
      </div>

      {mutationError instanceof Error && <Alert>{mutationError.message}</Alert>}

      {campaign.status === 'failed' && (
        <Alert className="flex-col items-start gap-3">
          <div>
            <p className="font-medium">This campaign didn't launch</p>
            <p className="mt-1 text-sm">
              {campaign.launches
                .filter((launch) => launch.status === 'failed')
                .map((launch) => PLATFORM_LABEL[launch.platform])
                .join(' and ')}{' '}
              ran into a problem going live. Your agency can review and retry it.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="default"
              onClick={() => flagIssueMutation.mutate()}
              disabled={flagIssueMutation.isPending || flagIssueMutation.isSuccess}
            >
              {flagIssueMutation.isPending
                ? 'Notifying…'
                : flagIssueMutation.isSuccess
                  ? 'Notified'
                  : 'Notify your agency'}
            </Button>
            <a
              href={`mailto:${campaign.agencyContactEmail}?subject=${encodeURIComponent(
                `Campaign didn't launch: ${campaign.businessDescription}`,
              )}`}
              className="text-sm font-medium text-primary hover:underline"
            >
              Email your agency
            </a>
          </div>
          {flagIssueMutation.isSuccess && (
            <p className="text-sm">Your agency has been notified and can see this in their audit log.</p>
          )}
        </Alert>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6 text-sm">
          {detailRows.map((row) => (
            <div key={row.label}>
              <p className="text-muted-foreground">{row.label}</p>
              {row.href ? (
                <a
                  href={row.href}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate font-medium text-primary hover:underline"
                >
                  {row.value}
                </a>
              ) : (
                <p className="font-medium text-foreground">{row.value}</p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {(campaign.googlePlan || campaign.metaPlan) && (
        <Tabs defaultValue="google">
          <TabsList>
            <TabsTrigger value="google">Google Ads</TabsTrigger>
            <TabsTrigger value="meta">Meta</TabsTrigger>
          </TabsList>
          <TabsContent value="google">
            {campaign.googlePlan ? (
              <GooglePlanView plan={campaign.googlePlan} />
            ) : (
              <p className="text-sm text-muted-foreground">No Google Ads plan.</p>
            )}
          </TabsContent>
          <TabsContent value="meta">
            {campaign.metaPlan ? (
              <MetaPlanView plan={campaign.metaPlan} />
            ) : (
              <p className="text-sm text-muted-foreground">No Meta plan.</p>
            )}
          </TabsContent>
        </Tabs>
      )}

      {campaign.projectedMetrics && <ProjectedMetricsSection metrics={campaign.projectedMetrics} />}

      {campaign.status === 'approved' && (
        <div className="flex gap-2">
          <Button onClick={() => approveMutation.mutate()} disabled={approveMutation.isPending}>
            {approveMutation.isPending ? 'Approving…' : 'Approve'}
          </Button>
          <Button variant="outline" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}>
            {rejectMutation.isPending ? 'Rejecting…' : 'Reject'}
          </Button>
        </div>
      )}
    </div>
  )
}
