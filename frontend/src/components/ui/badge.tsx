import { type HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const badgeVariants = cva('inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'border-border bg-surface text-muted-foreground',
      success: 'border-success-border bg-success-muted text-success',
      destructive: 'border-destructive-border bg-destructive-muted text-destructive',
      primary: 'border-transparent bg-primary-soft text-primary',
      accent: 'border-transparent bg-accent-soft text-foreground',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
