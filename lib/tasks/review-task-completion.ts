'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'

export type ActionState = { formError?: string; field?: 'reason' } | undefined

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
  if (reason.length > TEXT_LIMITS.reviewNote) return { formError: tooLong('Reason', TEXT_LIMITS.reviewNote), field: 'reason' }

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
  field?: 'reason'
  summary?: string
}

type ReviewRow = { id: string; ok: boolean; error: string | null }

// review_task_completions answers one row per id, in ascending id order, so the first failure
// is the lowest id's. A call that fails outright (not an admin, a network error) fails them all.
function tally(requested: number, rows: ReviewRow[] | null, error: { message: string } | null) {
  if (error) return { succeeded: 0, failed: requested, firstError: error.message }
  const failures = (rows ?? []).filter((row) => !row.ok)
  return { succeeded: (rows ?? []).length - failures.length, failed: failures.length, firstError: failures[0]?.error }
}

export async function bulkApproveTaskCompletionsAction(_prevState: BulkActionState | undefined, formData: FormData): Promise<BulkActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const completionIds = formData.getAll('completionIds').map(String)
  if (completionIds.length === 0) return { formError: 'Select at least one completion.' }

  const { data, error } = await supabase.rpc('review_task_completions', { p_ids: completionIds, p_approve: true })
  const { succeeded, failed, firstError } = tally(completionIds.length, data, error)

  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
  revalidatePath('/', 'layout')
  if (failed === 0) return { summary: `${succeeded} approved.` }
  return { summary: `${succeeded} approved, ${failed} failed (${firstError}).` }
}

export async function bulkRejectTaskCompletionsAction(_prevState: BulkActionState | undefined, formData: FormData): Promise<BulkActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const completionIds = formData.getAll('completionIds').map(String)
  if (completionIds.length === 0) return { formError: 'Select at least one completion.' }

  const reason = String(formData.get('reason') ?? '').trim()
  if (reason.length > TEXT_LIMITS.reviewNote) return { formError: tooLong('Reason', TEXT_LIMITS.reviewNote), field: 'reason' }

  const { data, error } = await supabase.rpc('review_task_completions', {
    p_ids: completionIds,
    p_approve: false,
    p_note: reason || null,
  })
  const { succeeded, failed, firstError } = tally(completionIds.length, data, error)

  revalidatePath('/admin/tasks')
  if (failed === 0) return { summary: `${succeeded} rejected.` }
  return { summary: `${succeeded} rejected, ${failed} failed (${firstError}).` }
}
