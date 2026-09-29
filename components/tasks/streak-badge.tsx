import type { TaskSummary } from '@/lib/tasks/list-tasks'
import { MIN_STREAK_SHOWN, streakLabel } from '@/lib/tasks/streak-label'

export function StreakBadge({ period, count }: { period: NonNullable<TaskSummary['period']>; count: number }) {
  if (count < MIN_STREAK_SHOWN) return null
  return (
    <span className="inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full bg-gold-soft px-[9px] text-xs font-extrabold text-gold">
      <span aria-hidden="true">🔥</span>
      {streakLabel(period, count)}
    </span>
  )
}
