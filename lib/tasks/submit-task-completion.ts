'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'
import type { ProofRecord } from '@/lib/proof/types'

export type ActionState = { formError?: string; field?: 'note' } | undefined

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

  const { error } = await supabase.rpc('submit_task_completion', {
    p_task_id: taskId,
    p_note: note || null,
    p_attachments: attachments,
  })
  if (error) return { formError: error.message.charAt(0).toUpperCase() + error.message.slice(1) + '.' }

  revalidatePath('/tasks')
  return undefined
}
