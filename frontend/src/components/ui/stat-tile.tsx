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
    <div
      className={cn(
        'flex flex-col gap-4 rounded-2xl border border-border/70 bg-card px-5 py-5 shadow-[0_1px_2px_rgba(18,32,51,0.04),0_4px_16px_rgba(18,32,51,0.05)]',
        className,
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      </div>
      <p className="font-sans text-[32px] font-semibold leading-none tracking-tight tabular-nums text-foreground">{value}</p>
    </div>
  )
}
