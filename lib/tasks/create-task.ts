'use server'

import { revalidatePath } from 'next/cache'
import { rewardError } from './limits'
import { requireUser } from '@/lib/auth/require-user'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'
import { friendlyError } from '@/lib/errors/friendly-error'
import { isUuid } from '@/lib/uuid'
import { CREATE_TASK_ERRORS } from './task-errors'

const ATTEMPT_KEY_INDEX = 'tasks_attempt_key_idx'

export type ActionState = { formError?: string; field?: 'title' | 'description' | 'reward_amount' | 'period' } | undefined

const PERIODS = ['daily', 'weekly', 'monthly', 'yearly'] as const

export async function createTaskAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const title = String(formData.get('title') ?? '').trim()
  // A textarea's newlines arrive as CRLF once the browser serialises the form, doubling up
  // against maxLength, which counts one character per line break.
  const description = String(formData.get('description') ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  const rewardAmount = Number(formData.get('reward_amount'))
  const isRepeatable = formData.get('is_repeatable') === 'on'
  const period = String(formData.get('period') ?? '')
  const proofRequired = formData.get('proof_required') === 'on'
  const attemptKey = String(formData.get('idempotency_key') ?? '')

  if (!title) return { formError: 'Enter a title.', field: 'title' }
  if (title.length > TEXT_LIMITS.taskTitle) return { formError: tooLong('Title', TEXT_LIMITS.taskTitle), field: 'title' }
  if (description.length > TEXT_LIMITS.taskDescription) {
    return { formError: tooLong('Description', TEXT_LIMITS.taskDescription), field: 'description' }
  }
  const rewardProblem = rewardError(rewardAmount)
  if (rewardProblem) return { formError: rewardProblem, field: 'reward_amount' }
  if (isRepeatable && !PERIODS.includes(period as (typeof PERIODS)[number])) {
    return { formError: 'Choose a cadence for a repeatable task.', field: 'period' }
  }

  const { error } = await supabase.from('tasks').insert({
    title,
    description: description || null,
    reward_amount: rewardAmount,
    is_repeatable: isRepeatable,
    period: isRepeatable ? period : null,
    proof_required: proofRequired,
    // useOffline replays an action whose response was lost; the key makes the replay a no-op (#258).
    ...(isUuid(attemptKey) ? { attempt_key: attemptKey } : {}),
  })

  // 23505 on the key's index: this attempt already created the task, which is what was asked for.
  if (error && !(error.code === '23505' && error.message.includes(ATTEMPT_KEY_INDEX))) return friendlyError(error, CREATE_TASK_ERRORS, 'Creating a task failed')

  revalidatePath('/admin/tasks')
  return undefined
}
