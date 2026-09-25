'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'

export type ActionState = { formError?: string } | undefined

export async function placeBetAction(marketId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const outcomeId = String(formData.get('outcome_id') ?? '')
  const amountRaw = String(formData.get('amount') ?? '')
  const amount = Number(amountRaw)

  if (!outcomeId) return { formError: 'Choose an outcome.' }
  if (!Number.isInteger(amount) || amount <= 0) return { formError: 'Enter a whole number of DC greater than 0.' }

  const { error } = await supabase.rpc('place_bet', {
    p_market_id: marketId,
    p_outcome_id: outcomeId,
    p_amount: amount,
  })

  if (error) return { formError: error.message }

  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
  revalidatePath('/', 'layout')
  return undefined
}
