import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useClientPortalApiClient } from '../lib/clientPortalApiClientContext'
import { STATUS_BADGE_VARIANT, STATUS_LABELS } from '../lib/statusDisplay'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'

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
        <h1 className="text-xl font-semibold text-foreground">Your campaigns</h1>
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
                <TableCell className="text-muted-foreground">${campaign.budgetUsd.toFixed(0)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(campaign.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
