import type { TaskSummary } from './list-tasks'

// A single period done isn't a streak yet.
export const MIN_STREAK_SHOWN = 2

const UNIT: Record<NonNullable<TaskSummary['period']>, string> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
}

export function streakLabel(period: NonNullable<TaskSummary['period']>, count: number): string {
  return `${count}-${UNIT[period]} streak`
}
