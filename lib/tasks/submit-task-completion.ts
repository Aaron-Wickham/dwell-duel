'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'

export type ActionState = { formError?: string } | undefined

export async function submitTaskCompletionAction(taskId: string, _prevState: ActionState, _formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const { error } = await supabase.rpc('submit_task_completion', { p_task_id: taskId })
  if (error) return { formError: error.message }

  revalidatePath('/tasks')
  return undefined
}
