'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'

export type ActionState = { formError?: string } | undefined

export async function adjustBalanceAction(profileId: string, _prevState: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const amount = Number(formData.get('amount'))
  const reason = String(formData.get('reason') ?? '').trim()

  if (!Number.isInteger(amount) || amount === 0) return { formError: 'Enter a non-zero whole number of DC.' }
  if (!reason) return { formError: 'Enter a reason.' }

  const { error } = await supabase.rpc('adjust_balance', {
    p_profile_id: profileId,
    p_amount: amount,
    p_reason: reason,
  })
  if (error) return { formError: error.message }

  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
  revalidatePath('/', 'layout')
  return undefined
}
