import { Check, X } from 'lucide-react'
import { cn } from '../lib/utils'
import type { CampaignDraftStatus } from '../lib/types'

type StepState = 'complete' | 'current' | 'error' | 'upcoming'

const STEP_LABELS = ['Brief', 'Generated', 'Guardrails', 'Your approval', 'Client approval', 'Launched']

// Explicit per-status lookup rather than a formula — with only 9 statuses this is
// easier to verify by inspection than deriving branch points algorithmically, and
// the three rejection/failure statuses aren't points on a single linear path.
const STEP_STATES: Record<CampaignDraftStatus, StepState[]> = {
  pending_generation: ['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming', 'upcoming'],
  adapted: ['complete', 'current', 'upcoming', 'upcoming', 'upcoming', 'upcoming'],
  guardrail_checked: ['complete', 'complete', 'current', 'upcoming', 'upcoming', 'upcoming'],
  rejected: ['complete', 'complete', 'complete', 'error', 'upcoming', 'upcoming'],
  approved: ['complete', 'complete', 'complete', 'complete', 'current', 'upcoming'],
  client_rejected: ['complete', 'complete', 'complete', 'complete', 'error', 'upcoming'],
  client_approved: ['complete', 'complete', 'complete', 'complete', 'complete', 'current'],
  failed: ['complete', 'complete', 'complete', 'complete', 'complete', 'error'],
  launched: ['complete', 'complete', 'complete', 'complete', 'complete', 'complete'],
}

export function StatusStepper({ status }: { status: CampaignDraftStatus }) {
  const states = STEP_STATES[status]

  return (
    <ol className="flex items-start">
      {STEP_LABELS.map((label, i) => {
        const state = states[i]
        return (
          <li key={label} data-state={state} className="flex flex-1 flex-col items-center gap-1.5 last:flex-none">
            <div className="flex w-full items-center">
              {i > 0 && (
                <div className={cn('h-px flex-1', states[i - 1] !== 'upcoming' ? 'bg-primary' : 'bg-border')} />
              )}
              <div
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs',
                  state === 'complete' && 'border-primary bg-primary text-primary-foreground',
                  state === 'current' && 'border-primary bg-card text-primary',
                  state === 'error' && 'border-destructive bg-destructive-muted text-destructive',
                  state === 'upcoming' && 'border-border bg-card text-muted-foreground',
                )}
              >
                {state === 'complete' && <Check className="h-3.5 w-3.5" />}
                {state === 'error' && <X className="h-3.5 w-3.5" />}
                {state === 'current' && <div className="h-2 w-2 rounded-full bg-primary" />}
              </div>
              {i < STEP_LABELS.length - 1 && <div className="h-px flex-1 bg-transparent" />}
            </div>
            <span
              className={cn(
                'text-center text-xs',
                state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground',
                state === 'error' && 'font-medium text-destructive',
              )}
            >
              {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
