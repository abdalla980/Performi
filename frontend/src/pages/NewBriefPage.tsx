import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useApiClient } from '../lib/apiClientContext'
import type { BriefInput, Platform } from '../lib/types'
import { BudgetCalculator } from '../components/BudgetCalculator'
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
  websiteUrl: string
  targetLocation: string
  targetAudience: string
  endDate: string
  platformGoogle: boolean
  platformMeta: boolean
  competitors: string
  uniqueSellingPoints: string
  excludedKeywords: string
}

const EMPTY_ROW: BriefRow = {
  businessDescription: '',
  budgetUsd: '',
  goals: '',
  websiteUrl: '',
  targetLocation: '',
  targetAudience: '',
  endDate: '',
  platformGoogle: true,
  platformMeta: true,
  competitors: '',
  uniqueSellingPoints: '',
  excludedKeywords: '',
}

function toBriefInput(clientId: string, row: BriefRow): BriefInput {
  const platforms: Platform[] = []
  if (row.platformGoogle) platforms.push('google')
  if (row.platformMeta) platforms.push('meta')

  return {
    clientId,
    businessDescription: row.businessDescription,
    budgetUsd: Number(row.budgetUsd),
    goals: row.goals,
    websiteUrl: row.websiteUrl || undefined,
    targetLocation: row.targetLocation || undefined,
    targetAudience: row.targetAudience || undefined,
    endDate: row.endDate || undefined,
    platforms,
    competitors: row.competitors || undefined,
    uniqueSellingPoints: row.uniqueSellingPoints || undefined,
    excludedKeywords: row.excludedKeywords
      ? row.excludedKeywords
          .split(',')
          .map((keyword) => keyword.trim())
          .filter(Boolean)
      : undefined,
  }
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
        next[clientId] = next[clientId] ?? { ...EMPTY_ROW }
      } else {
        delete next[clientId]
      }
      return next
    })
  }

  const updateRow = <Field extends keyof BriefRow>(clientId: string, field: Field, value: BriefRow[Field]) => {
    setRows((prev) => ({ ...prev, [clientId]: { ...prev[clientId], [field]: value } }))
  }

  const submitMutation = useMutation({
    mutationFn: async () => {
      const briefs = Object.entries(rows).map(([clientId, row]) => toBriefInput(clientId, row))
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
      (id) =>
        rows[id].businessDescription.trim() &&
        Number(rows[id].budgetUsd) > 0 &&
        rows[id].goals.trim() &&
        (rows[id].platformGoogle || rows[id].platformMeta),
    )

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    submitMutation.mutate()
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-foreground">New brief</h1>
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
                  <CardContent className="flex flex-col gap-4">
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
                        <Label htmlFor={`budget-${client.id}`}>Budget (USD/month)</Label>
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

                    <BudgetCalculator
                      onApply={(monthlyBudgetUsd) => updateRow(client.id, 'budgetUsd', String(monthlyBudgetUsd))}
                    />

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor={`website-${client.id}`}>Website / landing page URL</Label>
                        <Input
                          id={`website-${client.id}`}
                          type="url"
                          placeholder="https://example.com"
                          value={row.websiteUrl}
                          onChange={(event) => updateRow(client.id, 'websiteUrl', event.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor={`end-date-${client.id}`}>Campaign end date (optional)</Label>
                        <Input
                          id={`end-date-${client.id}`}
                          type="date"
                          value={row.endDate}
                          onChange={(event) => updateRow(client.id, 'endDate', event.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-2">
                        <Label htmlFor={`location-${client.id}`}>Target location</Label>
                        <Input
                          id={`location-${client.id}`}
                          placeholder="Austin, TX + 15mi radius"
                          value={row.targetLocation}
                          onChange={(event) => updateRow(client.id, 'targetLocation', event.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-2">
                        <Label htmlFor={`audience-${client.id}`}>Target audience</Label>
                        <Input
                          id={`audience-${client.id}`}
                          placeholder="Homeowners 35-55 interested in renovation"
                          value={row.targetAudience}
                          onChange={(event) => updateRow(client.id, 'targetAudience', event.target.value)}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`competitors-${client.id}`}>Competitors</Label>
                      <Input
                        id={`competitors-${client.id}`}
                        placeholder="Names of competitors to stand out from"
                        value={row.competitors}
                        onChange={(event) => updateRow(client.id, 'competitors', event.target.value)}
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`usp-${client.id}`}>Unique selling points</Label>
                      <Textarea
                        id={`usp-${client.id}`}
                        placeholder="What makes this business worth choosing?"
                        value={row.uniqueSellingPoints}
                        onChange={(event) => updateRow(client.id, 'uniqueSellingPoints', event.target.value)}
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor={`excluded-${client.id}`}>Excluded/negative keywords (comma-separated)</Label>
                      <Input
                        id={`excluded-${client.id}`}
                        placeholder="free, cheap, jobs"
                        value={row.excludedKeywords}
                        onChange={(event) => updateRow(client.id, 'excludedKeywords', event.target.value)}
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label>Platforms</Label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm text-foreground">
                          <Checkbox
                            checked={row.platformGoogle}
                            onChange={(event) => updateRow(client.id, 'platformGoogle', event.target.checked)}
                          />
                          Google Ads
                        </label>
                        <label className="flex items-center gap-2 text-sm text-foreground">
                          <Checkbox
                            checked={row.platformMeta}
                            onChange={(event) => updateRow(client.id, 'platformMeta', event.target.checked)}
                          />
                          Meta
                        </label>
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
