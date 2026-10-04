import type { ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

// Tones come only from the semantic tokens (win, loss, gold, sunk), never `primary`: lime in dark is
// kept for the primary action and first place.
const chipVariants = cva('no-callout inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-extrabold', {
  variants: {
    tone: {
      open: 'bg-acc-soft text-acc-text',
      wait: 'bg-gold-soft text-gold',
      won: 'bg-win-soft text-win',
      done: 'bg-sunk text-ink',
      lost: 'bg-loss-soft text-loss',
      void: 'bg-sunk text-ink2',
    },
    size: {
      md: 'h-7 px-2.5 text-[13px]',
      sm: 'h-6 px-[9px] text-xs',
    },
  },
  defaultVariants: { size: 'md' },
})

export type StatusChipTone = 'open' | 'wait' | 'won' | 'done' | 'lost' | 'void'

export function StatusChip({
  tone,
  size = 'md',
  className,
  children,
}: {
  tone: StatusChipTone
  size?: 'md' | 'sm'
  className?: string
  children: ReactNode
}) {
  return <span className={cn(chipVariants({ tone, size }), className)}>{children}</span>
}
