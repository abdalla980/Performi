import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useApiClient } from '../lib/apiClientContext'
import { cn } from '../lib/utils'
import { Alert } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { buttonVariants } from '../components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'

export function ClientsPage() {
  const apiClient = useApiClient()
  const navigate = useNavigate()

  const {
    data: clients,
    isPending,
    isError,
  } = useQuery({
    queryKey: ['clients'],
    queryFn: () => apiClient.listClients(),
  })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Clients</h1>
          <p className="text-sm text-muted-foreground">The accounts you manage campaigns for.</p>
        </div>
        <Link to="/clients/new" className={cn(buttonVariants(), 'gap-2')}>
          <Plus className="h-4 w-4" />
          Add client
        </Link>
      </div>

      {isPending && <p className="text-sm text-muted-foreground">Loading clients…</p>}
      {isError && <Alert>Couldn't load clients. Try refreshing the page.</Alert>}
      {clients && clients.length === 0 && <p className="text-sm text-muted-foreground">No clients yet.</p>}

      {clients && clients.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Google Ads</TableHead>
              <TableHead>Meta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => (
              <TableRow key={client.id} onClick={() => navigate(`/clients/${client.id}`)} className="cursor-pointer">
                <TableCell className="font-medium text-foreground">{client.name}</TableCell>
                <TableCell>
                  <Badge variant={client.googleConnected ? 'success' : 'default'}>
                    {client.googleConnected ? 'Connected' : 'Not connected'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={client.metaConnected ? 'success' : 'default'}>
                    {client.metaConnected ? 'Connected' : 'Not connected'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}
