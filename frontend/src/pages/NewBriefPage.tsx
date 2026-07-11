import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '../lib/apiClientContext'
import type { BriefInput } from '../lib/types'
import { Alert } from '../components/ui/alert'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Checkbox } from '../components/ui/checkbox'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'

interface BriefRow {
  businessDescription: string
  budgetUsd: string
  goals: string
}

export function NewBriefPage() {
  const apiClient = useApiClient()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [rows, setRows] = useState<Record<string, BriefRow>>({})
  const [error, setError] = useState<string | null>(null)

  const { data: clients, isPending } = useQuery({
    queryKey: ['clients'],
    queryFn: () => apiClient.listClients(),
  })

  const toggleClient = (clientId: string, checked: boolean) => {
    setRows((prev) => {
      const next = { ...prev }
      if (checked) {
        next[clientId] = next[clientId] ?? { businessDescription: '', budgetUsd: '', goals: '' }
      } else {
        delete next[clientId]
      }
      return next
    })
  }

  const updateRow = (clientId: string, field: keyof BriefRow, value: string) => {
    setRows((prev) => ({ ...prev, [clientId]: { ...prev[clientId], [field]: value } }))
  }

  const submitMutation = useMutation({
    mutationFn: async () => {
      const briefs: BriefInput[] = Object.entries(rows).map(([clientId, row]) => ({
        clientId,
        businessDescription: row.businessDescription,
        budgetUsd: Number(row.budgetUsd),
        goals: row.goals,
      }))
      const drafts = await apiClient.submitBriefsBatch(briefs)
      await Promise.all(drafts.map((draft) => apiClient.generateDraft(draft.id)))
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['briefs'] })
      navigate('/')
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to submit brief.'),
  })

  const selectedClientIds = Object.keys(rows)
  const canSubmit =
    selectedClientIds.length > 0 &&
    selectedClientIds.every(
      (id) => rows[id].businessDescription.trim() && Number(rows[id].budgetUsd) > 0 && rows[id].goals.trim(),
    )

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    submitMutation.mutate()
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">New brief</h1>
        <p className="text-sm text-muted-foreground">
          Select one or more clients and describe the campaign for each — submitted together as a batch.
        </p>
      </div>

      {isPending && <p className="text-sm text-muted-foreground">Loading clients…</p>}

      {clients && clients.length === 0 && <Alert>No clients yet. Add a client first before submitting a brief.</Alert>}

      {clients && clients.length > 0 && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {clients.map((client) => {
            const isSelected = client.id in rows
            const row = rows[client.id]
            return (
              <Card key={client.id}>
                <CardHeader className="flex-row items-center gap-3 space-y-0">
                  <Checkbox
                    checked={isSelected}
                    onChange={(event) => toggleClient(client.id, event.target.checked)}
                    aria-label={`Include ${client.name}`}
                  />
                  <CardTitle className="text-base">{client.name}</CardTitle>
                </CardHeader>
                {isSelected && (
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`description-${client.id}`}>Business description</Label>
                      <Textarea
                        id={`description-${client.id}`}
                        value={row.businessDescription}
                        onChange={(event) => updateRow(client.id, 'businessDescription', event.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor={`budget-${client.id}`}>Budget (USD)</Label>
                        <Input
                          id={`budget-${client.id}`}
                          type="number"
                          value={row.budgetUsd}
                          onChange={(event) => updateRow(client.id, 'budgetUsd', event.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor={`goals-${client.id}`}>Goals</Label>
                        <Input
                          id={`goals-${client.id}`}
                          value={row.goals}
                          onChange={(event) => updateRow(client.id, 'goals', event.target.value)}
                        />
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            )
          })}

          {error && <Alert>{error}</Alert>}

          <Button type="submit" disabled={!canSubmit || submitMutation.isPending} className="self-start">
            {submitMutation.isPending
              ? 'Generating…'
              : `Generate ${selectedClientIds.length || ''} campaign${selectedClientIds.length === 1 ? '' : 's'}`.trim()}
          </Button>
        </form>
      )}
    </div>
  )
}
