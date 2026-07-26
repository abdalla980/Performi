import { cn } from '../lib/utils'

interface PerformiLogoProps {
  className?: string
  /** Show wordmark next to the mark. Default true. */
  withWordmark?: boolean
  /** Mark size in px. Design default is 28 (≈12px bars area). */
  size?: number
}

export function PerformiLogo({ className, withWordmark = true, size = 28 }: PerformiLogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
        className="shrink-0"
      >
        <rect width="32" height="32" rx="8" fill="currentColor" className="text-primary" />
        <rect x="7" y="18" width="4" height="7" rx="1" fill="#F8FAFF" fillOpacity="0.55" />
        <rect x="14" y="12" width="4" height="13" rx="1" fill="#F8FAFF" fillOpacity="0.85" />
        <rect x="21" y="7" width="4" height="18" rx="1" fill="#F8FAFF" />
        <circle cx="25" cy="7" r="2.5" fill="currentColor" className="text-accent" />
      </svg>
      {withWordmark && (
        <span className="font-display text-lg font-semibold tracking-tight text-foreground">
          Perform<span className="text-primary">i</span>
        </span>
      )}
    </span>
  )
}
