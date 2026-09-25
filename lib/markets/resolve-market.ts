'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'

export type ActionState = { formError?: string } | undefined

export async function resolveMarketAction(
  marketId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const outcomeId = String(formData.get('outcome_id') ?? '')
  if (!outcomeId) return { formError: 'Choose the winning outcome.' }

  const { error } = await supabase.rpc('resolve_market', {
    p_market_id: marketId,
    p_outcome_id: outcomeId,
  })

  if (error) return { formError: error.message }

  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
  revalidatePath('/', 'layout')
  return undefined
}
