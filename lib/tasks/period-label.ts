import type { TaskSummary } from './list-tasks'

export const PERIOD_LABEL: Record<NonNullable<TaskSummary['period']>, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
}

// The cadence word after a task's reward on Tasks ("10 DC · weekly", #394).
export function cadenceWord(task: Pick<TaskSummary, 'isRepeatable' | 'period'>): string {
  return task.isRepeatable && task.period ? PERIOD_LABEL[task.period].toLowerCase() : 'once'
}

// When an approved repeating task opens again (#266). Periods run on US Eastern time
// (compute_period_key, 0054), so the reset is midnight Eastern going into the new period.
export const AGAIN_LABEL: Record<NonNullable<TaskSummary['period']>, string> = {
  daily: 'Again at midnight ET',
  weekly: 'Again Monday, midnight ET',
  monthly: 'Again on the 1st, midnight ET',
  yearly: 'Again Jan 1, midnight ET',
}
