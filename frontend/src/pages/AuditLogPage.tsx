import { useQuery } from '@tanstack/react-query'
import { useApiClient } from '../lib/apiClientContext'
import { Alert } from '../components/ui/alert'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'

function formatPayload(payload: Record<string, unknown>): string {
  const entries = Object.entries(payload)
  if (entries.length === 0) return '—'
  return entries.map(([key, value]) => `${key}: ${String(value)}`).join(', ')
}

export function AuditLogPage() {
  const apiClient = useApiClient()

  const {
    data: entries,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['audit-log'],
    queryFn: () => apiClient.listAuditLog(),
  })

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-foreground">Activity</h1>
        <p className="text-sm text-muted-foreground">
          Everything that's happened across your clients — approvals, launches, connections — newest first.
        </p>
      </div>

      {isPending && <p className="text-sm text-muted-foreground">Loading audit log…</p>}
      {isError && <Alert>Couldn't load the audit log.</Alert>}
      {entries && entries.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}

      {entries && entries.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event</TableHead>
              <TableHead>Details</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell className="font-medium text-foreground">{entry.eventType}</TableCell>
                <TableCell className="max-w-md truncate text-muted-foreground">
                  {formatPayload(entry.payload)}
                </TableCell>
                <TableCell className="text-muted-foreground">{new Date(entry.createdAt).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
