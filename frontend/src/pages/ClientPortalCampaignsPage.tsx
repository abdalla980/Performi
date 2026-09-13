import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useClientPortalApiClient } from '../lib/clientPortalApiClientContext'
import { STATUS_BADGE_VARIANT, STATUS_LABELS } from '../lib/statusDisplay'
import type { CampaignDraftStatus } from '../lib/types'
import { cn } from '../lib/utils'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'

// What a client should actually do with a campaign in this status — approved
// needs a decision, failed needs explaining, everything else is informational.
const ACTION_LABEL: Record<CampaignDraftStatus, string> = {
  pending_generation: 'View',
  adapted: 'View',
  guardrail_checked: 'View',
  approved: 'Review',
  rejected: 'View',
  client_approved: 'View',
  client_rejected: 'View',
  launched: 'View',
  failed: 'See why',
}

export function ClientPortalCampaignsPage() {
  const apiClient = useClientPortalApiClient()
  const navigate = useNavigate()

  const {
    data: campaigns,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['portal-campaigns'],
    queryFn: () => apiClient.listCampaigns(),
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">Your campaigns</h1>
        <p className="text-sm text-muted-foreground">Campaigns your agency has prepared, awaiting your review.</p>
      </div>

      {isPending && <p className="text-sm text-muted-foreground">Loading campaigns…</p>}
      {isError && <Alert>Couldn't load your campaigns. Try refreshing the page.</Alert>}
      {campaigns && campaigns.length === 0 && (
        <p className="text-sm text-muted-foreground">No campaigns are ready for your review yet.</p>
      )}

      {campaigns && campaigns.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((campaign) => (
              <TableRow
                key={campaign.id}
                onClick={() => navigate(`/portal/campaigns/${campaign.id}`)}
                className="cursor-pointer"
              >
                <TableCell className="max-w-sm truncate font-medium text-foreground">
                  {campaign.businessDescription}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_BADGE_VARIANT[campaign.status]}>{STATUS_LABELS[campaign.status]}</Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">${campaign.budgetUsd.toFixed(0)}/mo</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(campaign.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-right">
                  <Link
                    to={`/portal/campaigns/${campaign.id}`}
                    onClick={(event) => event.stopPropagation()}
                    className={cn(
                      'text-sm font-medium hover:underline',
                      campaign.status === 'failed'
                        ? 'text-destructive'
                        : campaign.status === 'approved'
                          ? 'text-primary'
                          : 'text-muted-foreground',
                    )}
                  >
                    {ACTION_LABEL[campaign.status]} →
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
