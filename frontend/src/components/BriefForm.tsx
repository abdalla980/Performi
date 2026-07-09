import { useState, type FormEvent } from 'react'
import type { BriefInput } from '../lib/types'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Textarea } from './ui/textarea'
import { Alert } from './ui/alert'

interface BriefFormProps {
  clientId: string
  onSubmit: (brief: BriefInput) => Promise<void>
}

export function BriefForm({ clientId, onSubmit }: BriefFormProps) {
  const [businessDescription, setBusinessDescription] = useState('')
  const [budget, setBudget] = useState('')
  const [goals, setGoals] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const budgetUsd = Number(budget)
    if (!(budgetUsd > 0)) {
      setError('Budget must be greater than zero.')
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit({ clientId, businessDescription, budgetUsd, goals })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>New campaign brief</CardTitle>
        <CardDescription>Describe the client's business and we'll draft a campaign.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="business-description">Business description</Label>
            <Textarea
              id="business-description"
              value={businessDescription}
              onChange={(event) => setBusinessDescription(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="budget">Budget (USD)</Label>
            <Input
              id="budget"
              type="number"
              value={budget}
              onChange={(event) => setBudget(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="goals">Goal</Label>
            <Input id="goals" type="text" value={goals} onChange={(event) => setGoals(event.target.value)} />
          </div>

          {error && <Alert>{error}</Alert>}

          <Button type="submit" disabled={submitting} className="mt-2 self-start">
            {submitting ? 'Generating…' : 'Generate campaign'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
