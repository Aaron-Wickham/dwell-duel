'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { friendlyError, type KnownError } from '@/lib/errors/friendly-error'

export type ActionState = { formError?: string } | undefined

// cancel_bet's raises (0037, 0046).
const CANCEL_BET_ERRORS: readonly KnownError<never>[] = [
  { match: 'not invited', formError: 'Only invited members can cancel a bet.' },
  { match: 'bet not found', formError: 'This bet no longer exists.' },
  { match: 'this market has closed, so the bet can no longer be cancelled', formError: 'This market has closed, so the bet can no longer be cancelled.' },
]

export async function cancelBetAction(betId: number, _prevState: ActionState, _formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const { error } = await supabase.rpc('cancel_bet', { p_bet_id: betId })
  if (error) return friendlyError(error, CANCEL_BET_ERRORS, 'cancel_bet failed')

  // Refreshes the shared layout too, so the nav's balance stays current.
  revalidatePath('/', 'layout')
  return undefined
}
