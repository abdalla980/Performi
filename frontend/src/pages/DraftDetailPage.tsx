import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ExternalLink, XCircle } from 'lucide-react'
import { useApiClient } from '../lib/apiClientContext'
import { STATUS_BADGE_VARIANT, STATUS_LABELS } from '../lib/statusDisplay'
import type { Platform } from '../lib/types'
import { GooglePlanView, MetaPlanView, ProjectedMetricsSection } from '../components/CampaignPlanViews'
import { StatusStepper } from '../components/StatusStepper'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Label } from '../components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Textarea } from '../components/ui/textarea'

// Neither platform officially supports deep-linking to one specific campaign by ID
// (confirmed: Google's own AdWords API forums say ocid-based deep links aren't
// supported), so these go to the account-level dashboard rather than a link that
// might silently 404 or land somewhere wrong.
const PLATFORM_DASHBOARD_URL: Record<Platform, string> = {
  google: 'https://ads.google.com/aw/overview',
  meta: 'https://adsmanager.facebook.com/adsmanager/',
}
const PLATFORM_LABEL: Record<Platform, string> = { google: 'Google Ads', meta: 'Meta Ads Manager' }

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

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
    { label: 'Budget', value: `$${draft.budgetUsd.toFixed(0)}/mo` },
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
          <h1 className="font-display text-xl font-semibold text-foreground">{draft.clientName}</h1>
          <p className="text-sm text-muted-foreground">{draft.businessDescription}</p>
        </div>
        <Badge variant={STATUS_BADGE_VARIANT[draft.status]}>{STATUS_LABELS[draft.status]}</Badge>
      </div>

      <StatusStepper status={draft.status} />

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

          {draft.status === 'failed' && <Alert>This campaign failed to launch — review the errors below and retry.</Alert>}

          {(draft.status === 'client_approved' || draft.status === 'failed') && (
            <Button onClick={() => launchMutation.mutate()} disabled={launchMutation.isPending} className="self-start">
              {launchMutation.isPending ? 'Launching…' : draft.status === 'failed' ? 'Retry launch' : 'Launch'}
            </Button>
          )}

          {draft.launches.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Launch results</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {draft.launches.map((launch) => {
                  const isSimulated = launch.externalCampaignId?.startsWith('demo-') ?? false
                  return (
                    <div key={launch.platform} className="flex flex-col gap-1.5 text-sm">
                      <div className="flex items-center gap-2">
                        {launch.status === 'success' ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                        <span className="font-medium text-foreground">{PLATFORM_LABEL[launch.platform]}</span>
                        {isSimulated && <Badge variant="default">Simulated</Badge>}
                        <span className="text-xs text-muted-foreground">{formatDateTime(launch.attemptedAt)}</span>
                      </div>
                      {launch.status === 'success' ? (
                        <>
                          <p className="pl-6 text-muted-foreground">Campaign ID: {launch.externalCampaignId}</p>
                          {isSimulated ? (
                            <p className="pl-6 text-xs text-muted-foreground">
                              This platform wasn't really connected, so no real campaign was created — connect a
                              live account to launch for real.
                            </p>
                          ) : (
                            <a
                              href={PLATFORM_DASHBOARD_URL[launch.platform]}
                              target="_blank"
                              rel="noreferrer"
                              className="ml-6 inline-flex w-fit items-center gap-1 text-sm font-medium text-primary hover:underline"
                            >
                              View in {PLATFORM_LABEL[launch.platform]}
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                        </>
                      ) : (
                        <p className="pl-6 text-muted-foreground">{launch.errorMessage}</p>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {draft.status === 'launched' && (
            <Alert variant="success" className="flex-col items-start gap-1">
              <p className="font-medium">What happens next</p>
              <p className="text-sm">
                {draft.launches.some((l) => l.status === 'success' && !l.externalCampaignId?.startsWith('demo-'))
                  ? "Real campaigns are created paused by design — nothing is spending money yet. Review it in the platform's own dashboard and activate it there when you're ready."
                  : 'This was a simulated launch — connect a real Google Ads or Meta account for this client to actually go live.'}
              </p>
            </Alert>
          )}
        </div>
      </div>
    </div>
  )
}
