import { useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Button } from './ui/button'

const DISMISSED_KEY = 'performi-getting-started-dismissed'

interface Step {
  label: string
  description: string
  to?: string
}

const STEPS: Step[] = [
  { label: 'Add a client', description: 'The business you\'re running ads for.', to: '/clients/new' },
  { label: 'Submit a brief', description: 'Describe the business, budget, and goals.', to: '/campaigns/new' },
  { label: 'Review & approve', description: 'Check the generated campaign before it goes live.' },
  { label: 'Check Activity', description: 'See every approval, launch, and connection, newest first.', to: '/audit' },
]

export function GettingStartedCard() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === 'true')

  if (dismissed) return null

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, 'true')
    setDismissed(true)
  }

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <CardTitle className="text-base">Getting started with Performi</CardTitle>
        <Button variant="ghost" aria-label="Dismiss" onClick={dismiss} className="h-8 w-8 p-0">
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {STEPS.map((step, index) => (
          <div key={step.label} className="flex items-start gap-3 text-sm">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary">
              {index + 1}
            </div>
            <div>
              {step.to ? (
                <Link to={step.to} className="font-medium text-primary hover:underline">
                  {step.label}
                </Link>
              ) : (
                <span className="font-medium text-foreground">{step.label}</span>
              )}
              <p className="text-muted-foreground">{step.description}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
