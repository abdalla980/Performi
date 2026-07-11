import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useApiClient } from '../lib/apiClientContext'
import { STATUS_BADGE_VARIANT, STATUS_LABELS } from '../lib/statusDisplay'
import type { CampaignDraftStatus } from '../lib/types'
import { cn } from '../lib/utils'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { buttonVariants } from '../components/ui/button'
import { Select } from '../components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'

const STATUS_FILTERS: Array<{ value: CampaignDraftStatus | 'all'; label: string }> = [
  { value: 'all', label: 'All statuses' },
  ...(Object.keys(STATUS_LABELS) as CampaignDraftStatus[]).map((status) => ({
    value: status,
    label: STATUS_LABELS[status],
  })),
]

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

  const filteredDrafts = useMemo(() => {
    if (!drafts) return []
    return statusFilter === 'all' ? drafts : drafts.filter((draft) => draft.status === statusFilter)
  }, [drafts, statusFilter])

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Campaigns</h1>
          <p className="text-sm text-muted-foreground">Every campaign draft across all clients.</p>
        </div>
        <Link to="/campaigns/new" className={cn(buttonVariants(), 'gap-2')}>
          <Plus className="h-4 w-4" />
          New brief
        </Link>
      </div>

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

      {!isPending && !isError && filteredDrafts.length === 0 && (
        <p className="text-sm text-muted-foreground">No campaigns match this filter yet.</p>
      )}

      {!isPending && !isError && filteredDrafts.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Business</TableHead>
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
                <TableCell className="font-medium text-foreground">{draft.clientName}</TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground">{draft.businessDescription}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Badge variant={STATUS_BADGE_VARIANT[draft.status]}>{STATUS_LABELS[draft.status]}</Badge>
                    {draft.hasBlockingFlags && <Badge variant="destructive">Blocked</Badge>}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">${draft.budgetUsd.toFixed(0)}</TableCell>
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
