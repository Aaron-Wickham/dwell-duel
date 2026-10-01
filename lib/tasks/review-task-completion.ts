'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { friendlyError, type KnownError } from '@/lib/errors/friendly-error'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'
import { chunk, IN_CHUNK } from '@/lib/pagination/chunk'
import type { DbClient } from '@/lib/supabase/database'
import { afterAction, notifyTaskReviews } from '@/lib/push/notify'

export type ActionState = { formError?: string; field?: 'reason' } | undefined

// The raises of approve_task_completion, reject_task_completion and review_task_completions
// (0020, 0021, 0033, 0040, 0046), and the review note's length check.
const REVIEW_ERRORS: readonly KnownError<'reason'>[] = [
  { match: 'only a reviewer can approve a task completion', formError: 'Only a reviewer can review task submissions.' },
  { match: 'only a reviewer can reject a task completion', formError: 'Only a reviewer can review task submissions.' },
  { match: 'only a reviewer can review task completions', formError: 'Only a reviewer can review task submissions.' },
  { match: 'completion not found', formError: 'This submission no longer exists.' },
  { match: 'completion is not pending', formError: 'This submission has already been reviewed.' },
  { match: "you can't review your own submission", formError: 'You can’t review your own submission.' },
  { match: 'too many completions in one review', formError: 'Select fewer submissions at a time.' },
  { match: 'task_completions_review_note_length', formError: tooLong('Reason', TEXT_LIMITS.reviewNote), field: 'reason' },
]

// A replay of a review that already committed (Next re-sends an action whose response was lost) is
// refused as "not pending". If this reviewer's own review left it in the state asked for, that's success.
async function reviewedByMe(supabase: DbClient, message: string, completionId: string, userId: string, status: 'approved' | 'rejected') {
  if (message !== 'completion is not pending') return false
  const { data } = await supabase.from('task_completions').select('status, reviewed_by').eq('id', completionId).maybeSingle()
  return data?.status === status && data.reviewed_by === userId
}

export async function approveTaskCompletionAction(completionId: string, _prevState: ActionState, _formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const { error } = await supabase.rpc('approve_task_completion', { p_completion_id: completionId })
  if (error && (await reviewedByMe(supabase, error.message, completionId, user.id, 'approved'))) {
    revalidatePath('/', 'layout')
    return undefined
  }
  if (error) return friendlyError(error, REVIEW_ERRORS, 'approve_task_completion failed')
  afterAction(() => notifyTaskReviews([completionId]))

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
    p_reason: reason || undefined,
  })
  if (error && (await reviewedByMe(supabase, error.message, completionId, user.id, 'rejected'))) {
    revalidatePath('/admin/tasks')
    return undefined
  }
  if (error) return friendlyError(error, REVIEW_ERRORS, 'reject_task_completion failed')
  afterAction(() => notifyTaskReviews([completionId]))

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
// The failure's text is a raise or a constraint, so it's worded like a single review's.
function tally(requested: number, rows: ReviewRow[] | null, error: { message: string } | null) {
  if (error) return { succeeded: 0, failed: requested, firstError: friendlyError(error, REVIEW_ERRORS, 'review_task_completions failed').formError }
  const failures = (rows ?? []).filter((row) => !row.ok)
  const first = failures[0]?.error
  return {
    succeeded: (rows ?? []).length - failures.length,
    failed: failures.length,
    firstError: first ? friendlyError({ message: first }, REVIEW_ERRORS, 'review_task_completions row failed').formError : undefined,
  }
}

// Only the rows this call reviewed, so one that failed as already reviewed isn't announced twice.
function notifyReviewed(rows: ReviewRow[] | null) {
  const reviewed = (rows ?? []).filter((row) => row.ok).map((row) => row.id)
  if (reviewed.length > 0) afterAction(() => notifyTaskReviews(reviewed))
}

// After a replayed bulk review (Next re-sends an action whose response was lost), the rows the first
// call reviewed come back "not pending". Those this reviewer already moved to the requested status
// are done, so they count as succeeded rather than failed.
async function countReplayedAsDone(supabase: DbClient, rows: ReviewRow[] | null, userId: string, status: 'approved' | 'rejected') {
  if (!rows) return rows
  const notPending = rows.filter((row) => !row.ok && row.error === 'completion is not pending').map((row) => row.id)
  if (notPending.length === 0) return rows
  const mine = new Set<string>()
  for (const ids of chunk(notPending, IN_CHUNK)) {
    const { data } = await supabase.from('task_completions').select('id').in('id', ids).eq('reviewed_by', userId).eq('status', status)
    for (const row of data ?? []) mine.add(row.id)
  }
  return rows.map((row) => (mine.has(row.id) ? { ...row, ok: true, error: null } : row))
}

export async function bulkApproveTaskCompletionsAction(_prevState: BulkActionState | undefined, formData: FormData): Promise<BulkActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const completionIds = formData.getAll('completionIds').map(String)
  if (completionIds.length === 0) return { formError: 'Select at least one completion.' }

  const { data, error } = await supabase.rpc('review_task_completions', { p_ids: completionIds, p_approve: true })
  const { succeeded, failed, firstError } = tally(completionIds.length, await countReplayedAsDone(supabase, data, user.id, 'approved'), error)
  notifyReviewed(data)

  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
  revalidatePath('/', 'layout')
  if (failed === 0) return { summary: `${succeeded} approved.` }
  return { summary: `${succeeded} approved, ${failed} failed: ${firstError}` }
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
    p_note: reason || undefined,
  })
  const { succeeded, failed, firstError } = tally(completionIds.length, await countReplayedAsDone(supabase, data, user.id, 'rejected'), error)
  notifyReviewed(data)

  revalidatePath('/admin/tasks')
  if (failed === 0) return { summary: `${succeeded} rejected.` }
  return { summary: `${succeeded} rejected, ${failed} failed: ${firstError}` }
}
