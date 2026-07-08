import { useState, type FormEvent } from 'react'
import type { BriefInput } from '../lib/types'

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
    <form onSubmit={handleSubmit}>
      <label htmlFor="business-description">Business description</label>
      <textarea
        id="business-description"
        value={businessDescription}
        onChange={(event) => setBusinessDescription(event.target.value)}
      />

      <label htmlFor="budget">Budget (USD)</label>
      <input id="budget" type="number" value={budget} onChange={(event) => setBudget(event.target.value)} />

      <label htmlFor="goals">Goal</label>
      <input id="goals" type="text" value={goals} onChange={(event) => setGoals(event.target.value)} />

      {error && <p role="alert">{error}</p>}

      <button type="submit" disabled={submitting}>
        {submitting ? 'Generating…' : 'Generate campaign'}
      </button>
    </form>
  )
}
