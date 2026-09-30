'use server'

import { revalidatePath } from 'next/cache'
import { rewardError } from './limits'
import { requireUser } from '@/lib/auth/require-user'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'
import { friendlyError } from '@/lib/errors/friendly-error'
import { TASK_ERRORS } from './task-errors'

export type ActionState = { formError?: string; field?: 'title' | 'description' | 'reward_amount' } | undefined

export async function updateTaskAction(taskId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const title = String(formData.get('title') ?? '').trim()
  // A textarea's newlines arrive as CRLF once the browser serialises the form, doubling up
  // against maxLength, which counts one character per line break.
  const description = String(formData.get('description') ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  const rewardAmount = Number(formData.get('reward_amount'))
  const isActive = formData.get('is_active') === 'on'
  const proofRequired = formData.get('proof_required') === 'on'

  if (!title) return { formError: 'Enter a title.', field: 'title' }
  if (title.length > TEXT_LIMITS.taskTitle) return { formError: tooLong('Title', TEXT_LIMITS.taskTitle), field: 'title' }
  if (description.length > TEXT_LIMITS.taskDescription) {
    return { formError: tooLong('Description', TEXT_LIMITS.taskDescription), field: 'description' }
  }
  const rewardProblem = rewardError(rewardAmount)
  if (rewardProblem) return { formError: rewardProblem, field: 'reward_amount' }

  const { data, error } = await supabase
    .from('tasks')
    .update({ title, description: description || null, reward_amount: rewardAmount, is_active: isActive, proof_required: proofRequired })
    .eq('id', taskId)
    .select('id')

  if (error) return friendlyError(error, TASK_ERRORS, 'Updating a task failed')
  // RLS hides a row a non-admin may not edit (and an unknown id) instead of refusing it: the
  // update matches nothing and reports no error, so an empty result is the refusal (#221).
  if (!data?.length) return { formError: 'Only an admin can create or edit tasks.' }

  revalidatePath('/admin/tasks')
  return undefined
}
