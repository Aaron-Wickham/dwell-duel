'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'

export type ActionState = { formError?: string } | undefined

export async function updateTaskAction(taskId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const title = String(formData.get('title') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const rewardAmount = Number(formData.get('reward_amount'))
  const isActive = formData.get('is_active') === 'on'

  if (!title) return { formError: 'Enter a title.' }
  if (!Number.isInteger(rewardAmount) || rewardAmount <= 0) {
    return { formError: 'Enter a whole number of DC greater than 0.' }
  }

  const { error } = await supabase
    .from('tasks')
    .update({ title, description: description || null, reward_amount: rewardAmount, is_active: isActive })
    .eq('id', taskId)

  if (error) return { formError: error.message }

  revalidatePath('/admin/tasks')
  return undefined
}
