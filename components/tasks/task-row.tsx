import type { ReactNode } from 'react'
import { Check, Clock } from 'lucide-react'
import { ListCard } from '@/components/ui/list-card'
import { rowTitleClass } from '@/components/ui/page'
import { StatusChip } from '@/components/ui/status-chip'
import type { TaskSummary } from '@/lib/tasks/list-tasks'
import { MIN_STREAK_SHOWN } from '@/lib/tasks/streak-label'
import { cn } from '@/lib/utils'
import { StreakBadge } from './streak-badge'

export function PendingReviewChip() {
  return (
    <StatusChip tone="wait">
      <Clock aria-hidden="true" className="size-4" />
      Pending review
    </StatusChip>
  )
}

export type TaskRowState =
  | { kind: 'pending'; proofCount?: number }
  // again: when a repeating task can be done again, from its period; null for a one-off.
  | { kind: 'approved'; again?: string | null }
  // rejection: the latest submission was turned down; the reason is optional (#200).
  | { kind: 'available'; rejection?: { note: string | null } | null }

export function TaskRow({
  title,
  rewardAmount,
  description,
  cadence,
  streak,
  state,
  proofRequired = false,
  action,
}: {
  title: string
  rewardAmount: number
  description: string | null
  cadence?: string | null
  streak?: { period: NonNullable<TaskSummary['period']>; count: number } | null
  state: TaskRowState
  proofRequired?: boolean
  action?: ReactNode
}) {
  return (
    // A card that opens nothing: its only control is the action, which sits on its right from md.
    <ListCard tappable={false} className="flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
      <div className="flex min-w-0 grow flex-col gap-1">
        <p className={cn(rowTitleClass, 'break-words')}>
          {title} — <span className="text-gold">{rewardAmount} DC</span>
        </p>
        {(description || cadence || proofRequired || (streak && streak.count >= MIN_STREAK_SHOWN)) && (
          <p className="flex flex-wrap items-center gap-1 text-sm text-ink2">
            {description}
            {cadence && (
              <span className="inline-flex h-6 items-center whitespace-nowrap rounded-full bg-sunk px-[9px] text-xs font-extrabold text-ink2">
                {cadence}
              </span>
            )}
            {streak && <StreakBadge period={streak.period} count={streak.count} />}
            {proofRequired && (
              <span className="inline-flex h-6 items-center whitespace-nowrap rounded-full bg-sunk px-[9px] text-xs font-extrabold text-ink2">
                Proof required
              </span>
            )}
          </p>
        )}
      </div>
      <div className="flex min-h-11 shrink-0 flex-col items-start justify-center gap-1.5">
        {state.kind === 'pending' && (
          <>
            <PendingReviewChip />
            {Boolean(state.proofCount) && (
              <p className="text-sm text-ink2">
                Sent with {state.proofCount} {state.proofCount === 1 ? 'attachment' : 'attachments'}
              </p>
            )}
          </>
        )}
        {state.kind === 'approved' && (
          <>
            <StatusChip tone="open">
              <Check aria-hidden="true" className="size-4" />
              Approved
            </StatusChip>
            {state.again && <p className="text-sm text-ink2">{state.again}</p>}
          </>
        )}
        {state.kind === 'available' && (
          <>
            {action}
            {state.rejection && (
              <p className="max-w-[220px] text-sm text-ink2">
                Not approved{state.rejection.note && ` — ${state.rejection.note}`}
              </p>
            )}
          </>
        )}
      </div>
    </ListCard>
  )
}
