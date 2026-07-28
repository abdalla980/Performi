import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Rocket } from 'lucide-react'
import { useApiClient } from '../lib/apiClientContext'
import { buildPlatformManageUrl, PLATFORM_LABEL } from '../lib/platformLinks'
import { EmptyState } from '../components/ui/empty-state'
import { Alert } from '../components/ui/alert'
import { Avatar } from '../components/ui/avatar'
import { Button } from '../components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL

export function LaunchedCampaignsPage() {
  const apiClient = useApiClient()
  const queryClient = useQueryClient()

  const {
    data: drafts,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['briefs'],
    queryFn: () => apiClient.listBriefs(),
  })
  const { data: clients } = useQuery({
    queryKey: ['clients'],
    queryFn: () => apiClient.listClients(),
  })

  const launched = useMemo(
    () => (drafts ?? []).filter((draft) => draft.status === 'launched'),
    [drafts],
  )

  const metaAccountByClient = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const client of clients ?? []) {
      map.set(client.id, client.metaAdAccountId)
    }
    return map
  }, [clients])

  const archiveMutation = useMutation({
    mutationFn: (draftId: string) => apiClient.archiveDraft(draftId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['briefs'] })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-foreground">Launched</h1>
        <p className="text-sm text-muted-foreground">
          Every campaign that&apos;s been pushed — manage it in the platform, or archive it from this list.
        </p>
      </div>

      {isPending && <p className="text-sm text-muted-foreground">Loading launched campaigns…</p>}
      {isError && <Alert>Couldn&apos;t load launched campaigns. Try refreshing the page.</Alert>}

      {archiveMutation.isError && (
        <Alert>
          {archiveMutation.error instanceof Error
            ? archiveMutation.error.message
            : 'Failed to archive campaign.'}
        </Alert>
      )}

      {!isPending && !isError && launched.length === 0 && (
        <EmptyState
          icon={Rocket}
          title="No launched campaigns yet"
          description="Once you launch a campaign, it shows up here with links to manage it in Google Ads or Meta."
          actionLabel="View all campaigns"
          actionTo="/"
        />
      )}

      {!isPending && !isError && launched.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead>Launched</TableHead>
              <TableHead>Manage</TableHead>
              <TableHead className="w-28"> </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {launched.map((draft) => {
              const successfulLaunches = draft.launches.filter((launch) => launch.status === 'success')
              const launchedAt =
                successfulLaunches
                  .map((launch) => launch.attemptedAt)
                  .sort()
                  .at(-1) ?? draft.createdAt

              return (
                <TableRow key={draft.id}>
                  <TableCell className="font-medium text-foreground">
                    <Link to={`/campaigns/${draft.id}`} className="flex items-center gap-2 hover:underline">
                      <Avatar
                        name={draft.clientName}
                        src={draft.clientLogoUrl ? `${API_BASE_URL}${draft.clientLogoUrl}` : null}
                        className="h-6 w-6 text-[10px]"
                      />
                      <span className="flex flex-col">
                        <span>{draft.clientName}</span>
                        <span className="text-xs font-normal text-muted-foreground">{draft.businessDescription}</span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">${draft.budgetUsd.toFixed(0)}/mo</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(launchedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      {successfulLaunches.length === 0 ? (
                        <span className="text-xs text-muted-foreground">No platform links</span>
                      ) : (
                        successfulLaunches.map((launch) => (
                          <a
                            key={`${draft.id}-${launch.platform}-${launch.externalCampaignId}`}
                            href={buildPlatformManageUrl(launch.platform, {
                              externalCampaignId: launch.externalCampaignId,
                              metaAdAccountId: metaAccountByClient.get(draft.clientId),
                            })}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {PLATFORM_LABEL[launch.platform]}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ))
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={archiveMutation.isPending}
                      onClick={() => archiveMutation.mutate(draft.id)}
                    >
                      Archive
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
