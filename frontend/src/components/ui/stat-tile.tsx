import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/utils'

interface StatTileProps {
  label: string
  value: string | number
  icon: LucideIcon
  className?: string
}

export function StatTile({ label, value, icon: Icon, className }: StatTileProps) {
  return (
    <div className={cn('flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3', className)}>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div>
        <p className="font-mono text-xl font-semibold leading-tight text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
