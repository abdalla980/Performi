import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Clock, ListChecks, Plus, ShieldCheck, TrendingUp, Users } from 'lucide-react'
import { useApiClient } from '../lib/apiClientContext'
import { STATUS_BADGE_VARIANT, STATUS_LABELS } from '../lib/statusDisplay'
import type { CampaignDraftStatus, Platform } from '../lib/types'
import { cn } from '../lib/utils'
import { Alert } from '../components/ui/alert'
import { Avatar } from '../components/ui/avatar'
import { GettingStartedCard } from '../components/GettingStartedCard'
import { Badge } from '../components/ui/badge'
import { buttonVariants } from '../components/ui/button'
import { EmptyState } from '../components/ui/empty-state'
import { Select } from '../components/ui/select'
import { StatTile } from '../components/ui/stat-tile'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
const PLATFORM_BADGE: Record<Platform, { label: string; title: string }> = {
  google: { label: 'G', title: 'Google Ads' },
  meta: { label: 'M', title: 'Meta' },
}

const STATUS_FILTERS: Array<{ value: CampaignDraftStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  ...(Object.keys(STATUS_LABELS) as CampaignDraftStatus[]).map((status) => ({
    value: status,
    label: STATUS_LABELS[status],
  })),
]

const REBRIEF_ELIGIBLE_DAYS = 30

export function CampaignsPage() {
  const apiClient = useApiClient()
  const navigate = useNavigate()
  const [statusFilter, setStatusFilter] = useState<CampaignDraftStatus | 'all'>('all')

  const {
    data: drafts,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['briefs'],
    queryFn: () => apiClient.listBriefs(),
  })
  const { data: clients } = useQuery({ queryKey: ['clients'], queryFn: () => apiClient.listClients() })
  const { data: impactStats } = useQuery({ queryKey: ['impact-stats'], queryFn: () => apiClient.getImpactStats() })

  const filteredDrafts = useMemo(() => {
    if (!drafts) return []
    return statusFilter === 'all' ? drafts : drafts.filter((draft) => draft.status === statusFilter)
  }, [drafts, statusFilter])

  const hasNoClients = clients?.length === 0
  const hasNoDraftsYet = drafts?.length === 0

  const stats = useMemo(() => {
    const all = drafts ?? []
    return {
      clients: clients?.length ?? 0,
      awaitingReview: all.filter((d) => d.status === 'approved').length,
      needsAttention: all.filter((d) => d.status === 'failed' || d.hasBlockingFlags).length,
      launched: all.filter((d) => d.status === 'launched').length,
    }
  }, [drafts, clients])

  const rebriefCandidates = useMemo(() => {
    if (!drafts) return []
    const latestByClient = new Map<string, (typeof drafts)[number]>()
    for (const draft of drafts) {
      const current = latestByClient.get(draft.clientId)
      if (!current || new Date(draft.createdAt) > new Date(current.createdAt)) {
        latestByClient.set(draft.clientId, draft)
      }
    }
    const cutoff = Date.now() - REBRIEF_ELIGIBLE_DAYS * 24 * 60 * 60 * 1000
    return [...latestByClient.values()].filter(
      (draft) => draft.status === 'launched' && new Date(draft.createdAt).getTime() < cutoff,
    )
  }, [drafts])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl font-semibold text-foreground">Campaigns</h1>
          <p className="text-sm text-muted-foreground">Every campaign draft across all clients.</p>
        </div>
        <Link to="/campaigns/new" className={cn(buttonVariants(), 'gap-2')}>
          <Plus className="h-4 w-4" />
          New brief
        </Link>
      </div>

      <GettingStartedCard />

      {!hasNoClients && !hasNoDraftsYet && (
        <div role="region" aria-label="Campaign summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile icon={Users} label="Clients" value={stats.clients} />
          <StatTile icon={Clock} label="Awaiting client review" value={stats.awaitingReview} />
          <StatTile icon={AlertTriangle} label="Needs attention" value={stats.needsAttention} />
          <StatTile icon={CheckCircle2} label="Launched" value={stats.launched} />
        </div>
      )}

      {impactStats && impactStats.campaignsLaunched > 0 && (
        <div role="region" aria-label="Impact" className="grid grid-cols-2 gap-3 sm:grid-cols-2">
          <StatTile icon={TrendingUp} label="Est. hours saved" value={impactStats.estimatedHoursSaved.toFixed(0)} />
          <StatTile icon={ShieldCheck} label="Guardrail issues caught" value={impactStats.guardrailIssuesCaught} />
        </div>
      )}

      {rebriefCandidates.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
          <p className="text-sm font-medium text-foreground">Ready for a refresh</p>
          <div className="flex flex-col gap-1.5">
            {rebriefCandidates.map((draft) => (
              <div key={draft.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">
                  {draft.clientName} — launched {new Date(draft.createdAt).toLocaleDateString()}
                </span>
                <Link to={`/campaigns/new?duplicateFrom=${draft.id}`} className="font-medium text-primary hover:underline">
                  Refresh campaign
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <Select
        value={statusFilter}
        onChange={(event) => setStatusFilter(event.target.value as CampaignDraftStatus | 'all')}
        className="w-56"
        aria-label="Filter by status"
      >
        {STATUS_FILTERS.map((filter) => (
          <option key={filter.value} value={filter.value}>
            {filter.label}
          </option>
        ))}
      </Select>

      {isPending && <p className="text-sm text-muted-foreground">Loading campaigns…</p>}
      {isError && <Alert>Couldn't load campaigns. Try refreshing the page.</Alert>}

      {!isPending && !isError && hasNoClients && (
        <EmptyState
          icon={Users}
          title="Add your first client"
          description="Campaigns are built per client. Add a client before submitting your first brief."
          actionLabel="Add client"
          actionTo="/clients/new"
        />
      )}

      {!isPending && !isError && !hasNoClients && hasNoDraftsYet && (
        <EmptyState
          icon={ListChecks}
          title="Create your first brief"
          description="Submit a brief for one of your clients and Performi will draft the campaign for review."
          actionLabel="New brief"
          actionTo="/campaigns/new"
        />
      )}

      {!isPending && !isError && !hasNoClients && !hasNoDraftsYet && filteredDrafts.length === 0 && (
        <p className="text-sm text-muted-foreground">No campaigns match this filter yet.</p>
      )}

      {!isPending && !isError && filteredDrafts.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Platforms</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDrafts.map((draft) => (
              <TableRow
                key={draft.id}
                onClick={() => navigate(`/campaigns/${draft.id}`)}
                className="cursor-pointer"
              >
                <TableCell className="font-medium text-foreground">
                  <div className="flex items-center gap-2">
                    <Avatar
                      name={draft.clientName}
                      src={draft.clientLogoUrl ? `${API_BASE_URL}${draft.clientLogoUrl}` : null}
                      className="h-6 w-6 text-[10px]"
                    />
                    {draft.clientName}
                  </div>
                </TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground">{draft.businessDescription}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {draft.platforms.map((platform) => (
                      <span
                        key={platform}
                        title={PLATFORM_BADGE[platform].title}
                        className="flex h-5 w-5 items-center justify-center rounded-md bg-primary-soft text-[10px] font-semibold text-primary"
                      >
                        {PLATFORM_BADGE[platform].label}
                      </span>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={STATUS_BADGE_VARIANT[draft.status]}>{STATUS_LABELS[draft.status]}</Badge>
                    {draft.hasBlockingFlags && <Badge variant="destructive">Blocked</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">${draft.budgetUsd.toFixed(0)}/mo</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(draft.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
