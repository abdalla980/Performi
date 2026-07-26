import { cn } from '../../lib/utils'

interface AvatarProps {
  src?: string | null
  name: string
  className?: string
}

function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export function Avatar({ src, name, className }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn('h-8 w-8 shrink-0 rounded-full border border-border object-cover', className)}
      />
    )
  }
  return (
    <div
      role="img"
      aria-label={name}
      className={cn(
        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary',
        className,
      )}
    >
      {initialsFor(name)}
    </div>
  )
}
