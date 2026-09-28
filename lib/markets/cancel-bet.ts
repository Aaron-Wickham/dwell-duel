'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'

export type ActionState = { formError?: string } | undefined

export async function cancelBetAction(betId: number, _prevState: ActionState, _formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const { error } = await supabase.rpc('cancel_bet', { p_bet_id: betId })
  if (error) return { formError: error.message }

  // Refreshes the shared layout too, so the nav's balance stays current.
  revalidatePath('/', 'layout')
  return undefined
}
