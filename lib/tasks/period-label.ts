import type { TaskSummary } from './list-tasks'

export const PERIOD_LABEL: Record<NonNullable<TaskSummary['period']>, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

// When an approved repeating task opens again (#266). Periods run on US Eastern time
// (compute_period_key, 0054), so the reset is midnight Eastern going into the new period.
export const AGAIN_LABEL: Record<NonNullable<TaskSummary['period']>, string> = {
  daily: 'Again at midnight ET',
  weekly: 'Again Monday, midnight ET',
  monthly: 'Again on the 1st, midnight ET',
  yearly: 'Again Jan 1, midnight ET',
}
