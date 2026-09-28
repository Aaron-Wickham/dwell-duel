import type { KnownError } from '@/lib/errors/friendly-error'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'
import { MAX_TASK_REWARD } from './limits'

// The tasks table's RLS (0033) and constraints (0017, 0034, 0046), which both saving a new task
// and editing one can trip.
export const TASK_ERRORS: readonly KnownError<'title' | 'description' | 'reward_amount'>[] = [
  { match: 'new row violates row-level security policy for table "tasks"', formError: 'Only an admin can create or edit tasks.' },
  { match: 'tasks_title_length', formError: tooLong('Title', TEXT_LIMITS.taskTitle), field: 'title' },
  { match: 'tasks_description_length', formError: tooLong('Description', TEXT_LIMITS.taskDescription), field: 'description' },
  { match: 'tasks_reward_amount_check', formError: 'Enter a whole number of DC greater than 0.', field: 'reward_amount' },
  { match: 'tasks_reward_amount_max', formError: `A task can reward at most ${MAX_TASK_REWARD} DC.`, field: 'reward_amount' },
]

// Only a new task sets its cadence.
export const CREATE_TASK_ERRORS: readonly KnownError<'title' | 'description' | 'reward_amount' | 'period'>[] = [
  ...TASK_ERRORS,
  { match: 'tasks_period_check', formError: 'Choose a cadence for a repeatable task.', field: 'period' },
  { match: 'period_matches_repeatable', formError: 'Choose a cadence for a repeatable task.', field: 'period' },
]
