import type { GoogleCampaignPlan, MetaCampaignPlan, Platform, ProjectedMetrics } from '../lib/types'
import { Badge } from './ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'

export function GooglePlanView({ plan }: { plan: GoogleCampaignPlan }) {
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
      {plan.callouts.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Callouts:</span>
          {plan.callouts.map((callout) => (
            <Badge key={callout} variant="primary">
              {callout}
            </Badge>
          ))}
        </div>
      )}
      {Object.keys(plan.structuredSnippets).length > 0 && (
        <div className="flex flex-col gap-2">
          {Object.entries(plan.structuredSnippets).map(([header, values]) => (
            <div key={header} className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">{header}:</span>
              {values.map((value) => (
                <Badge key={value}>{value}</Badge>
              ))}
            </div>
          ))}
        </div>
      )}
      {plan.sitelinks.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Sitelinks:</span>
          {plan.sitelinks.map((link) => (
            <a
              key={`${link.text}-${link.url}`}
              href={link.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary hover:underline"
            >
              {link.text}
            </a>
          ))}
        </div>
      )}
      {plan.adGroups.map((adGroup) => (
        <div key={adGroup.name} className="rounded-md border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground">{adGroup.name}</h3>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {adGroup.keywords.map((keyword) => (
              <Badge key={keyword.text}>
                {keyword.text}
                <span className="ml-1 text-[10px] uppercase text-muted-foreground">{keyword.matchType}</span>
              </Badge>
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

export function MetaPlanView({ plan }: { plan: MetaCampaignPlan }) {
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
          {(adSet.ageMin != null || adSet.ageMax != null || adSet.interests.length > 0) && (
            <p className="mt-1 text-xs text-muted-foreground">
              {adSet.ageMin != null || adSet.ageMax != null
                ? `Ages ${adSet.ageMin ?? '?'}–${adSet.ageMax ?? '?'}`
                : null}
              {adSet.interests.length > 0 ? ` · Interests: ${adSet.interests.join(', ')}` : null}
            </p>
          )}
          <div className="mt-3 flex flex-col gap-3">
            {adSet.creatives.map((creative, index) => (
              <div key={`${creative.headline}-${index}`} className="rounded-md border border-border/60 p-3">
                <p className="text-sm font-medium text-foreground">{creative.headline}</p>
                <p className="mt-1 text-sm text-muted-foreground">{creative.body}</p>
                <Badge className="mt-2">{creative.callToAction}</Badge>
              </div>
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

export function ProjectedMetricsSection({ metrics }: { metrics: ProjectedMetrics }) {
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
        <div className="flex flex-col gap-3">
          {metrics.platforms.map((platform) => (
            <div key={platform.platform} className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{PLATFORM_LABEL[platform.platform]}</span>
                <span className="text-muted-foreground">
                  ${platform.dailyBudgetUsd.toFixed(2)}/day · {formatCompactNumber(platform.estimatedDailyClicks)}{' '}
                  clicks
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(platform.estimatedDailyClicks / maxClicks) * 100}%`,
                    backgroundColor: PLATFORM_COLOR[platform.platform],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
