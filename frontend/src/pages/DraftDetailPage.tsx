import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle } from 'lucide-react'
import { useApiClient } from '../lib/apiClientContext'
import { STATUS_BADGE_VARIANT, STATUS_LABELS } from '../lib/statusDisplay'
import { GooglePlanView, MetaPlanView, ProjectedMetricsSection } from '../components/CampaignPlanViews'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Label } from '../components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Textarea } from '../components/ui/textarea'

export function DraftDetailPage() {
  const { draftId = '' } = useParams<{ draftId: string }>()
  const apiClient = useApiClient()
  const queryClient = useQueryClient()
  const [reviewerNote, setReviewerNote] = useState('')

  const draftQueryKey = ['briefs', draftId] as const

  const {
    data: draft,
    isPending,
    isError,
  } = useQuery({
    queryKey: draftQueryKey,
    queryFn: () => apiClient.getBrief(draftId),
    enabled: Boolean(draftId),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: draftQueryKey })
    queryClient.invalidateQueries({ queryKey: ['briefs'] })
  }

  const generateMutation = useMutation({ mutationFn: () => apiClient.generateDraft(draftId), onSuccess: invalidate })
  const guardrailsMutation = useMutation({ mutationFn: () => apiClient.runGuardrails(draftId), onSuccess: invalidate })
  const approveMutation = useMutation({
    mutationFn: () => apiClient.approveDraft(draftId, reviewerNote || undefined),
    onSuccess: invalidate,
  })
  const rejectMutation = useMutation({
    mutationFn: () => apiClient.rejectDraft(draftId, reviewerNote || undefined),
    onSuccess: invalidate,
  })
  const launchMutation = useMutation({ mutationFn: () => apiClient.launchDraft(draftId), onSuccess: invalidate })

  if (isPending) {
    return <p className="text-sm text-muted-foreground">Loading campaign…</p>
  }
  if (isError || !draft) {
    return <Alert>Couldn't load this campaign.</Alert>
  }

  const mutationError =
    generateMutation.error ??
    guardrailsMutation.error ??
    approveMutation.error ??
    rejectMutation.error ??
    launchMutation.error

  const detailRows: Array<{ label: string; value: string; href?: string }> = [
    { label: 'Budget', value: `$${draft.budgetUsd.toFixed(0)}` },
    { label: 'Goals', value: draft.goals },
    { label: 'Platforms', value: draft.platforms.map((p) => (p === 'google' ? 'Google Ads' : 'Meta')).join(', ') },
  ]
  if (draft.websiteUrl) detailRows.push({ label: 'Website', value: draft.websiteUrl, href: draft.websiteUrl })
  if (draft.targetLocation) detailRows.push({ label: 'Target location', value: draft.targetLocation })
  if (draft.targetAudience) detailRows.push({ label: 'Target audience', value: draft.targetAudience })
  if (draft.endDate) detailRows.push({ label: 'End date', value: draft.endDate })
  if (draft.competitors) detailRows.push({ label: 'Competitors', value: draft.competitors })
  if (draft.uniqueSellingPoints) {
    detailRows.push({ label: 'Unique selling points', value: draft.uniqueSellingPoints })
  }
  if (draft.excludedKeywords.length > 0) {
    detailRows.push({ label: 'Excluded keywords', value: draft.excludedKeywords.join(', ') })
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{draft.clientName}</h1>
          <p className="text-sm text-muted-foreground">{draft.businessDescription}</p>
        </div>
        <Badge variant={STATUS_BADGE_VARIANT[draft.status]}>{STATUS_LABELS[draft.status]}</Badge>
      </div>

      {mutationError instanceof Error && <Alert>{mutationError.message}</Alert>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="flex flex-col gap-6">
          {draft.status === 'pending_generation' && (
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={generateMutation.isPending}
              className="self-start"
            >
              {generateMutation.isPending ? 'Generating…' : 'Generate campaign'}
            </Button>
          )}

          {(draft.googlePlan || draft.metaPlan) && (
            <Tabs defaultValue="google">
              <TabsList>
                <TabsTrigger value="google">Google Ads</TabsTrigger>
                <TabsTrigger value="meta">Meta</TabsTrigger>
              </TabsList>
              <TabsContent value="google">
                {draft.googlePlan ? (
                  <GooglePlanView plan={draft.googlePlan} />
                ) : (
                  <p className="text-sm text-muted-foreground">No Google Ads plan.</p>
                )}
              </TabsContent>
              <TabsContent value="meta">
                {draft.metaPlan ? (
                  <MetaPlanView plan={draft.metaPlan} />
                ) : (
                  <p className="text-sm text-muted-foreground">No Meta plan.</p>
                )}
              </TabsContent>
            </Tabs>
          )}

          {draft.projectedMetrics && <ProjectedMetricsSection metrics={draft.projectedMetrics} />}
        </div>

        <div className="flex flex-col gap-6 lg:sticky lg:top-8">
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

          {draft.status === 'adapted' && (
            <Button
              onClick={() => guardrailsMutation.mutate()}
              disabled={guardrailsMutation.isPending}
              className="self-start"
            >
              {guardrailsMutation.isPending ? 'Running guardrails…' : 'Run guardrails'}
            </Button>
          )}

          {draft.guardrail && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Guardrail report</CardTitle>
                <CardDescription>
                  {draft.guardrail.flags.length === 0
                    ? 'No issues found.'
                    : `${draft.guardrail.flags.length} flag(s) found.`}
                </CardDescription>
              </CardHeader>
              {draft.guardrail.flags.length > 0 && (
                <CardContent className="flex flex-col gap-2">
                  {draft.guardrail.flags.map((flag) => (
                    <div key={`${flag.code}-${flag.message}`} className="flex items-start gap-2 text-sm">
                      <Badge variant={flag.severity === 'block' ? 'destructive' : 'default'}>{flag.severity}</Badge>
                      <span className="text-foreground">{flag.message}</span>
                    </div>
                  ))}
                </CardContent>
              )}
            </Card>
          )}

          {draft.status === 'guardrail_checked' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="reviewer-note">Reviewer note (optional)</Label>
                <Textarea
                  id="reviewer-note"
                  value={reviewerNote}
                  onChange={(event) => setReviewerNote(event.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending || draft.hasBlockingFlags}
                  title={draft.hasBlockingFlags ? 'Resolve blocking guardrail flags before approving' : undefined}
                >
                  {approveMutation.isPending ? 'Approving…' : 'Approve'}
                </Button>
                <Button variant="outline" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}>
                  {rejectMutation.isPending ? 'Rejecting…' : 'Reject'}
                </Button>
              </div>
            </div>
          )}

          {draft.status === 'approved' && (
            <Alert variant="success">Awaiting the client's approval before this can launch.</Alert>
          )}

          {draft.status === 'client_rejected' && <Alert>The client rejected this campaign. Revise and regenerate.</Alert>}

          {draft.status === 'client_approved' && (
            <Button onClick={() => launchMutation.mutate()} disabled={launchMutation.isPending} className="self-start">
              {launchMutation.isPending ? 'Launching…' : 'Launch'}
            </Button>
          )}

          {draft.launches.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Launch results</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {draft.launches.map((launch) => (
                  <div key={launch.platform} className="flex items-center gap-2 text-sm">
                    {launch.status === 'success' ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span className="font-medium capitalize text-foreground">{launch.platform}</span>
                    <span className="text-muted-foreground">
                      {launch.status === 'success' ? `Campaign ID: ${launch.externalCampaignId}` : launch.errorMessage}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
