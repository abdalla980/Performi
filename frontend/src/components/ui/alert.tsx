import { type HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

export function Alert({
  className,
  variant = 'destructive',
  ...props
}: HTMLAttributes<HTMLDivElement> & { variant?: 'destructive' | 'success' }) {
  return (
    <div
      role={variant === 'destructive' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
        variant === 'destructive' && 'border-destructive-border bg-destructive-muted text-destructive',
        variant === 'success' && 'border-success-border bg-success-muted text-success',
        className,
      )}
      {...props}
    />
  )
}
