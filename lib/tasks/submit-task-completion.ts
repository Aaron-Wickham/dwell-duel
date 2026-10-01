'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { friendlyError, type KnownError } from '@/lib/errors/friendly-error'
import { afterAction, notifyTaskSubmitted } from '@/lib/push/notify'
import { RATE_LIMIT_ERRORS, TEXT_LIMITS, tooLong } from '@/lib/forms/limits'
import type { ProofRecord } from '@/lib/proof/types'

export type ActionState = { formError?: string; field?: 'note' } | undefined

// submit_task_completion's raises (0019, 0042, 0046), its attachment checks included, and the write
// limit (0078).
const SUBMIT_TASK_ERRORS: readonly KnownError<'note'>[] = [
  { match: 'not invited', formError: 'Only invited members can submit a task.' },
  { match: 'task not found or inactive', formError: 'This task is no longer available.' },
  { match: 'this task needs proof: add a photo, file or link', formError: 'This task needs proof: add a photo, file or link.' },
  {
    match: 'you already have a pending or approved submission for this task in the current period',
    formError: 'You’ve already submitted this task for the current period.',
  },
  { match: 'attachments must be a list', formError: 'Your attachments didn’t come through. Try again.' },
  { match: 'add at most 10 attachments', formError: 'Add at most 10 attachments.' },
  { match: 'links must start with http:// or https://', formError: 'Links must start with http:// or https://.' },
  { match: "that file can't be attached here", formError: 'That file can’t be attached here.' },
  { match: "an attachment didn't finish uploading; try again", formError: 'An attachment didn’t finish uploading. Try again.' },
  { match: 'unknown attachment kind', formError: 'Your attachments didn’t come through. Try again.' },
  RATE_LIMIT_ERRORS.task_submission,
]

// The files are already in storage by now (lib/proof/upload.ts); `attachments` is the JSON of
// their records, which submit_task_completion checks are the member's own before storing.
export async function submitTaskCompletionAction(taskId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const note = String(formData.get('note') ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (note.length > TEXT_LIMITS.proofNote) return { formError: tooLong('Note', TEXT_LIMITS.proofNote), field: 'note' }

  let attachments: ProofRecord[] = []
  try {
    attachments = JSON.parse(String(formData.get('attachments') || '[]'))
  } catch {
    return { formError: 'Your attachments didn’t come through. Try again.' }
  }

  const { data: completionId, error } = await supabase.rpc('submit_task_completion', {
    p_task_id: taskId,
    p_note: note || undefined,
    p_attachments: attachments,
  })
  if (error) return friendlyError(error, SUBMIT_TASK_ERRORS, 'submit_task_completion failed')

  afterAction(() => notifyTaskSubmitted(completionId))
  revalidatePath('/tasks')
  return undefined
}
