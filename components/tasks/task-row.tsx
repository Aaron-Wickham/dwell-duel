import type { ReactNode } from 'react'
import { Check } from 'lucide-react'
import { dividedRowClass } from '@/components/ui/list-card'
import { rowTitleClass } from '@/components/ui/page'
import type { TaskSummary } from '@/lib/tasks/list-tasks'
import { MIN_STREAK_SHOWN, streakLabel } from '@/lib/tasks/streak-label'
import { formatDcAmount } from '@/lib/format/dc'
import { cn } from '@/lib/utils'
import { SentDay } from './sent-day'

// Which of Tasks' groups the row is in (#394), with what that group says about it.
export type TaskRowState =
  | { kind: 'todo' }
  // sentAt is null only for the moment between the submission and the read that dates it.
  | { kind: 'waiting'; sentAt: string | null; now: number; proofCount?: number }
  // note: the reviewer's reason, which is optional (#200).
  | { kind: 'rejected'; note: string | null }
  // again: when a repeating task can be done again, from its period; null for a one-off (#266).
  | { kind: 'done'; again?: string | null }

// A divided row on the page (D2): no card and no chips. The reward leads in gold, then the cadence;
// only a fact that changes what you do (proof needed, a rejection's reason) gets a line of its own.
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
  // "weekly", "once" (cadenceWord).
  cadence: string
  streak?: { period: NonNullable<TaskSummary['period']>; count: number } | null
  state: TaskRowState
  proofRequired?: boolean
  // The submit dialog, for a task to do or to try again.
  action?: ReactNode
}) {
  const streakText = streak && streak.count >= MIN_STREAK_SHOWN ? streakLabel(streak.period, streak.count) : null

  if (state.kind === 'done') {
    const detail = [streakText, state.again].filter(Boolean).join(' · ')
    return (
      <li className={cn(dividedRowClass, 'flex items-center justify-between gap-3 text-ink2')}>
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="break-words">
            {title} · {formatDcAmount(rewardAmount)}
          </p>
          {detail && <p className="text-sm">{detail}</p>}
        </div>
        <Check aria-hidden="true" className="size-5 shrink-0 text-win" />
      </li>
    )
  }

  const attachments =
    state.kind === 'waiting' && state.proofCount
      ? `${state.proofCount} ${state.proofCount === 1 ? 'attachment' : 'attachments'}`
      : null

  return (
    <li className={cn(dividedRowClass, 'flex items-center justify-between gap-3')}>
      <div className="flex min-w-0 flex-col gap-1">
        <p className={cn(rowTitleClass, 'break-words')}>{title}</p>
        <p className="text-sm">
          <span className="font-bold text-gold">{formatDcAmount(rewardAmount)}</span>
          <span className="text-ink2">
            {state.kind === 'waiting' ? (
              <>
                {state.sentAt && (
                  <>
                    {' · sent '}
                    <SentDay iso={state.sentAt} now={state.now} />
                  </>
                )}
                {attachments && ` · ${attachments}`}
              </>
            ) : (
              <>
                {` · ${cadence}`}
                {streakText && ` · ${streakText}`}
              </>
            )}
          </span>
        </p>
        {state.kind === 'todo' && description && <p className="line-clamp-1 text-sm break-words text-ink2">{description}</p>}
        {state.kind !== 'waiting' && proofRequired && <p className="text-sm text-ink2">Photo, file or link needed</p>}
        {state.kind === 'rejected' && (
          <p className="text-sm break-words text-loss">{state.note ? `“${state.note}”` : 'No reason given.'}</p>
        )}
      </div>
      {(state.kind === 'todo' || state.kind === 'rejected') && action && (
        <div className="flex min-h-11 shrink-0 items-center">{action}</div>
      )}
    </li>
  )
}
