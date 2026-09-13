import { type SelectHTMLAttributes, forwardRef } from 'react'
import { cn } from '../../lib/utils'

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-xl border border-border/80 bg-card px-3.5 py-2 text-sm text-foreground shadow-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
)
Select.displayName = 'Select'
