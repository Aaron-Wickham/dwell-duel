'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'
import { clawbackMessage, parseClawbackError } from '@/lib/markets/clawback'
import type { ProofRecord } from '@/lib/proof/types'

export type ActionState = { formError?: string; field?: 'outcome' | 'note' } | undefined

export async function resolveMarketAction(
  marketId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const outcomeId = String(formData.get('outcome_id') ?? '')
  const note = String(formData.get('note') ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (!outcomeId) return { formError: 'Choose the winning outcome.', field: 'outcome' }
  if (!note) return { formError: 'Say why this outcome won.', field: 'note' }
  if (note.length > TEXT_LIMITS.resolutionNote) return { formError: tooLong('Note', TEXT_LIMITS.resolutionNote), field: 'note' }

  let attachments: ProofRecord[] = []
  try {
    attachments = JSON.parse(String(formData.get('attachments') || '[]'))
  } catch {
    return { formError: 'Your attachments didn’t come through. Try again.' }
  }

  const { error } = await supabase.rpc('resolve_market', {
    p_market_id: marketId,
    p_outcome_id: outcomeId,
    p_note: note,
    p_attachments: attachments,
  })

  if (error) {
    const short = parseClawbackError(error.message)
    return { formError: (short && clawbackMessage(short)) ?? error.message, field: 'outcome' }
  }

  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
  revalidatePath('/', 'layout')
  return undefined
}
