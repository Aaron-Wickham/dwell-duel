'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'

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
  if (!Number.isInteger(rewardAmount) || rewardAmount <= 0) {
    return { formError: 'Enter a whole number of DC greater than 0.', field: 'reward_amount' }
  }

  const { error } = await supabase
    .from('tasks')
    .update({ title, description: description || null, reward_amount: rewardAmount, is_active: isActive, proof_required: proofRequired })
    .eq('id', taskId)

  if (error) return { formError: error.message }

  revalidatePath('/admin/tasks')
  return undefined
}
