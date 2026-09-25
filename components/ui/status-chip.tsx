import type { ReactNode } from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const chipVariants = cva(
  'inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[13px] font-extrabold',
  {
    variants: {
      tone: {
        open: 'bg-acc-soft text-acc-text',
        wait: 'bg-gold-soft text-gold',
        done: 'bg-primary text-on-primary',
        lost: 'bg-loss-soft text-loss',
        void: 'bg-sunk text-ink2',
      },
    },
  },
)

export function StatusChip({
  tone,
  className,
  children,
}: {
  tone: 'open' | 'wait' | 'done' | 'lost' | 'void'
  className?: string
  children: ReactNode
}) {
  return <span className={cn(chipVariants({ tone }), className)}>{children}</span>
}
