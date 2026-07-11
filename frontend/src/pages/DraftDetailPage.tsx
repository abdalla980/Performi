import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle } from 'lucide-react'
import { useApiClient } from '../lib/apiClientContext'
import { STATUS_BADGE_VARIANT, STATUS_LABELS } from '../lib/statusDisplay'
import type { GoogleCampaignPlan, MetaCampaignPlan, Platform, ProjectedMetrics } from '../lib/types'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Label } from '../components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Textarea } from '../components/ui/textarea'

function GooglePlanView({ plan }: { plan: GoogleCampaignPlan }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
        <span>${(plan.dailyBudgetMicros / 1_000_000).toFixed(2)}/day</span>
        {plan.finalUrl && (
          <a href={plan.finalUrl} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">
            {plan.finalUrl}
          </a>
        )}
      </div>
      {plan.negativeKeywords.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Negative keywords:</span>
          {plan.negativeKeywords.map((keyword) => (
            <Badge key={keyword} variant="destructive">
              {keyword}
            </Badge>
          ))}
        </div>
      )}
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
    </div>
  )
}

const PLATFORM_LABEL: Record<Platform, string> = { google: 'Google Ads', meta: 'Meta' }
// Fixed categorical order (google, meta) — validated for CVD-safe contrast against
// this app's white card surface; never reassign or cycle these per-render.
const PLATFORM_COLOR: Record<Platform, string> = { google: '#2a78d6', meta: '#1baf7a' }

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  )
}

function ProjectedMetricsSection({ metrics }: { metrics: ProjectedMetrics }) {
  const totalDailyClicks = metrics.platforms.reduce((sum, p) => sum + p.estimatedDailyClicks, 0)
  const totalDailyImpressions = metrics.platforms.reduce((sum, p) => sum + p.estimatedDailyImpressions, 0)
  const maxClicks = Math.max(...metrics.platforms.map((p) => p.estimatedDailyClicks), 1)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Projected performance</CardTitle>
        <CardDescription>
          Estimated from budget and industry-benchmark CPC/CTR assumptions — not guaranteed results.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Est. daily impressions" value={formatCompactNumber(totalDailyImpressions)} />
          <StatTile label="Est. daily clicks" value={formatCompactNumber(totalDailyClicks)} />
          <StatTile
            label="Est. reach in target location"
            value={
              metrics.estimatedLocationReach != null ? formatCompactNumber(metrics.estimatedLocationReach) : '—'
            }
          />
        </div>

        {metrics.platforms.length > 1 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-muted-foreground">Estimated daily clicks by platform</p>
            {metrics.platforms.map((platform) => (
              <div key={platform.platform} className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-sm text-foreground">{PLATFORM_LABEL[platform.platform]}</span>
                <div className="h-6 flex-1 rounded-r-[4px] bg-muted">
                  <div
                    className="h-6 rounded-r-[4px]"
                    style={{
                      width: `${Math.max((platform.estimatedDailyClicks / maxClicks) * 100, 4)}%`,
                      backgroundColor: PLATFORM_COLOR[platform.platform],
                    }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-sm font-medium text-foreground">
                  {platform.estimatedDailyClicks.toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MetaPlanView({ plan }: { plan: MetaCampaignPlan }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
        <span>Objective: {plan.objective}</span>
        {plan.websiteUrl && (
          <a href={plan.websiteUrl} target="_blank" rel="noreferrer" className="truncate text-primary hover:underline">
            {plan.websiteUrl}
          </a>
        )}
      </div>
      {plan.adSets.map((adSet) => (
        <div key={adSet.name} className="rounded-md border border-border p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">{adSet.name}</h3>
            <span className="text-sm text-muted-foreground">${(adSet.dailyBudgetCents / 100).toFixed(2)}/day</span>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{adSet.targetingDescription}</p>
          <p className="mt-3 text-sm font-medium text-foreground">{adSet.creativeHeadline}</p>
          <p className="mt-1 text-sm text-muted-foreground">{adSet.creativeBody}</p>
          <Badge className="mt-2">{adSet.callToAction}</Badge>
        </div>
      ))}
    </div>
  )
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
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">{draft.clientName}</h1>
          <p className="text-sm text-muted-foreground">{draft.businessDescription}</p>
        </div>
        <Badge variant={STATUS_BADGE_VARIANT[draft.status]}>{STATUS_LABELS[draft.status]}</Badge>
      </div>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 pt-6 text-sm">
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

      {mutationError instanceof Error && <Alert>{mutationError.message}</Alert>}

      {draft.status === 'pending_generation' && (
        <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} className="self-start">
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

      {draft.status === 'adapted' && (
        <Button onClick={() => guardrailsMutation.mutate()} disabled={guardrailsMutation.isPending} className="self-start">
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
            <Textarea id="reviewer-note" value={reviewerNote} onChange={(event) => setReviewerNote(event.target.value)} />
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
  )
}
