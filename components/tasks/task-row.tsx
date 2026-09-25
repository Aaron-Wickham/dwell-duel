import type { ReactNode } from 'react'
import { Check, Clock } from 'lucide-react'
import { StatusChip } from '@/components/ui/status-chip'

const h3Class = 'text-[17px] font-extrabold leading-[1.3] tracking-[-0.01em]'

export type TaskRowState = { kind: 'pending' } | { kind: 'approved' } | { kind: 'available'; rejectionNote?: string | null }

export function TaskRow({
  title,
  rewardAmount,
  description,
  cadence,
  state,
  action,
}: {
  title: string
  rewardAmount: number
  description: string | null
  cadence?: string | null
  state: TaskRowState
  action?: ReactNode
}) {
  return (
    <li className="flex flex-col gap-3 py-[18px] md:flex-row md:items-center md:gap-5 md:py-[22px]">
      <div className="flex grow flex-col gap-1">
        <p className={h3Class}>
          {title} — <span className="text-gold">{rewardAmount} DC</span>
        </p>
        {(description || cadence) && (
          <p className="flex flex-wrap items-center gap-1 text-sm text-ink2">
            {description}
            {cadence && (
              <span className="inline-flex h-6 items-center whitespace-nowrap rounded-full bg-sunk px-[9px] text-xs font-extrabold text-ink2">
                {cadence}
              </span>
            )}
          </p>
        )}
      </div>
      <div className="flex min-h-11 shrink-0 flex-col items-start justify-center gap-1.5">
        {state.kind === 'pending' && (
          <StatusChip tone="wait">
            <Clock aria-hidden="true" className="size-4" />
            Pending review
          </StatusChip>
        )}
        {state.kind === 'approved' && (
          <StatusChip tone="open">
            <Check aria-hidden="true" className="size-4" />
            Approved
          </StatusChip>
        )}
        {state.kind === 'available' && (
          <>
            {action}
            {state.rejectionNote && <p className="max-w-[220px] text-sm text-ink2">Not approved — {state.rejectionNote}</p>}
          </>
        )}
      </div>
    </li>
  )
}
