import { useId, useState } from 'react'
import { Calculator } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'

// Illustrative guideline only, not real market data — same posture as
// backend/app/services/projections.py's benchmark assumptions. Spending up to
// this share of a customer's value to acquire them is a common rough rule of
// thumb, not something derived from this agency's actual performance.
const ACQUISITION_BUDGET_PERCENT = 0.15
const DAYS_PER_MONTH = 30

interface BudgetCalculatorProps {
  /** Called with a monthly USD figure — Brief.budgetUsd is a monthly budget, not daily. */
  onApply: (monthlyBudgetUsd: number) => void
}

export function BudgetCalculator({ onApply }: BudgetCalculatorProps) {
  const [open, setOpen] = useState(false)
  const [avgCustomerValue, setAvgCustomerValue] = useState('')
  const [targetCustomersPerMonth, setTargetCustomersPerMonth] = useState('')
  const valueId = useId()
  const targetId = useId()

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="default" className="h-auto self-start px-0 py-1 text-xs text-primary" onClick={() => setOpen(true)}>
        Not sure how much to spend? Use our calculator
      </Button>
    )
  }

  const value = Number(avgCustomerValue)
  const targets = Number(targetCustomersPerMonth)
  const valid = value > 0 && targets > 0
  const suggestedMonthly = valid ? value * ACQUISITION_BUDGET_PERCENT * targets : null

  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed border-border p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-foreground">
        <Calculator className="h-3.5 w-3.5" />
        Budget calculator
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={valueId} className="text-xs">
            Average customer value ($)
          </Label>
          <Input
            id={valueId}
            type="number"
            min="0"
            placeholder="1000"
            value={avgCustomerValue}
            onChange={(event) => setAvgCustomerValue(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={targetId} className="text-xs">
            New customers per month
          </Label>
          <Input
            id={targetId}
            type="number"
            min="0"
            placeholder="5"
            value={targetCustomersPerMonth}
            onChange={(event) => setTargetCustomersPerMonth(event.target.value)}
          />
        </div>
      </div>

      {suggestedMonthly !== null && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <p className="text-muted-foreground">
            Suggested budget: <span className="font-medium text-foreground">${suggestedMonthly.toFixed(2)}/mo</span>{' '}
            (~${(suggestedMonthly / DAYS_PER_MONTH).toFixed(2)}/day)
          </p>
          <Button type="button" size="default" onClick={() => onApply(Number(suggestedMonthly.toFixed(2)))}>
            Use this budget
          </Button>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Rough guideline based on spending up to {ACQUISITION_BUDGET_PERCENT * 100}% of a customer's value to acquire
        them — not a guarantee, and not based on this account's real performance yet.
      </p>
    </div>
  )
}
