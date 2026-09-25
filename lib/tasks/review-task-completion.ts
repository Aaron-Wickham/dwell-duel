'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'

export type ActionState = { formError?: string } | undefined

export async function approveTaskCompletionAction(completionId: string, _prevState: ActionState, _formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const { error } = await supabase.rpc('approve_task_completion', { p_completion_id: completionId })
  if (error) return { formError: error.message }

  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
  revalidatePath('/', 'layout')
  return undefined
}

export async function rejectTaskCompletionAction(completionId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const reason = String(formData.get('reason') ?? '').trim()
  const { error } = await supabase.rpc('reject_task_completion', {
    p_completion_id: completionId,
    p_reason: reason || null,
  })
  if (error) return { formError: error.message }

  revalidatePath('/admin/tasks')
  return undefined
}

export interface BulkActionState {
  formError?: string
  summary?: string
}

export async function bulkApproveTaskCompletionsAction(_prevState: BulkActionState | undefined, formData: FormData): Promise<BulkActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const completionIds = formData.getAll('completionIds').map(String)
  if (completionIds.length === 0) return { formError: 'Select at least one completion.' }

  let succeeded = 0
  let firstError: string | undefined
  for (const id of completionIds) {
    const { error } = await supabase.rpc('approve_task_completion', { p_completion_id: id })
    if (error) {
      firstError ??= error.message
    } else {
      succeeded++
    }
  }

  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
  revalidatePath('/', 'layout')
  const failed = completionIds.length - succeeded
  if (failed === 0) return { summary: `${succeeded} approved.` }
  return { summary: `${succeeded} approved, ${failed} failed (${firstError}).` }
}

export async function bulkRejectTaskCompletionsAction(_prevState: BulkActionState | undefined, formData: FormData): Promise<BulkActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const completionIds = formData.getAll('completionIds').map(String)
  if (completionIds.length === 0) return { formError: 'Select at least one completion.' }

  const reason = String(formData.get('reason') ?? '').trim()

  let succeeded = 0
  let firstError: string | undefined
  for (const id of completionIds) {
    const { error } = await supabase.rpc('reject_task_completion', {
      p_completion_id: id,
      p_reason: reason || null,
    })
    if (error) {
      firstError ??= error.message
    } else {
      succeeded++
    }
  }

  revalidatePath('/admin/tasks')
  const failed = completionIds.length - succeeded
  if (failed === 0) return { summary: `${succeeded} rejected.` }
  return { summary: `${succeeded} rejected, ${failed} failed (${firstError}).` }
}
