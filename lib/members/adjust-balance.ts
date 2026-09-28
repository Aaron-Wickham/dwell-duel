'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { isBalanceCheckViolation } from '@/lib/errors/balance-error'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type ActionState = { formError?: string; field?: 'amount' | 'reason' } | undefined

export async function adjustBalanceAction(profileId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const amount = Number(formData.get('amount'))
  const reason = String(formData.get('reason') ?? '').trim()

  if (!Number.isInteger(amount) || amount === 0) return { formError: 'Enter a non-zero whole number of DC.', field: 'amount' }
  if (!reason) return { formError: 'Add a reason — it’s shown in the ledger next to this adjustment.', field: 'reason' }
  if (reason.length > TEXT_LIMITS.adjustReason) return { formError: tooLong('Reason', TEXT_LIMITS.adjustReason), field: 'reason' }

  const attemptKey = String(formData.get('idempotency_key') ?? '')
  const { error } = await supabase.rpc('adjust_balance', {
    p_profile_id: profileId,
    p_amount: amount,
    p_reason: reason,
    p_idempotency_key: UUID.test(attemptKey) ? attemptKey : undefined,
  })
  if (error) {
    if (isBalanceCheckViolation(error)) {
      const { data: profile } = await supabase.from('profiles').select('display_name, balance').eq('id', profileId).maybeSingle()
      if (profile) {
        return { formError: `That would take ${profile.display_name}’s balance below zero — they have ${profile.balance} DC.`, field: 'amount' }
      }
    }
    return { formError: error.message }
  }

  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
  revalidatePath('/', 'layout')
  return undefined
}
