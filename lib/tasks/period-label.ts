import type { TaskSummary } from './list-tasks'

export const PERIOD_LABEL: Record<NonNullable<TaskSummary['period']>, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}
