import type { TaskSummary } from '@/lib/tasks/list-tasks'
import { MIN_STREAK_SHOWN, streakLabel } from '@/lib/tasks/streak-label'
import { StatusChip } from '@/components/ui/status-chip'

export function StreakBadge({ period, count }: { period: NonNullable<TaskSummary['period']>; count: number }) {
  if (count < MIN_STREAK_SHOWN) return null
  return (
    <StatusChip tone="wait" size="sm">
      {streakLabel(period, count)}
    </StatusChip>
  )
}
