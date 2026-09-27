import type { JSX } from 'react'
import { cn } from '@/lib/utils'

export function BetaBadge({ className }: { className?: string }): JSX.Element {
  return (
    <span
      className={cn(
        'inline-flex h-5 items-center whitespace-nowrap rounded-full bg-sunk px-2 text-[10px] font-extrabold tracking-wider text-ink2 uppercase',
        className,
      )}
    >
      Beta
    </span>
  )
}
