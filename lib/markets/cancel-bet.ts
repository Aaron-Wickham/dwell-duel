'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { friendlyError, type KnownError } from '@/lib/errors/friendly-error'
import { RATE_LIMIT_ERRORS } from '@/lib/forms/limits'

export type ActionState = { formError?: string } | undefined

// cancel_bet's raises (supabase/migrations/0046) and the write limit (0090).
const CANCEL_BET_ERRORS: readonly KnownError<never>[] = [
  { match: 'not invited', formError: 'Only invited members can cancel a bet.' },
  { match: 'bet not found', formError: 'This bet is no longer here. It may already have been cancelled.' },
  { match: 'this market has closed, so the bet can no longer be cancelled', formError: 'This market has closed, so the bet can no longer be cancelled.' },
  RATE_LIMIT_ERRORS.bet_cancel,
]

export async function cancelBetAction(betId: number, _prevState: ActionState, _formData: FormData): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const { error } = await supabase.rpc('cancel_bet', { p_bet_id: betId })
  // Refreshes the shared layout too, so the nav's balance stays current. A refusal usually means
  // the page is stale (the bet is gone, the market has closed), so it refreshes then as well.
  revalidatePath('/', 'layout')
  if (error) return friendlyError(error, CANCEL_BET_ERRORS, 'Cancelling a bet failed')
  return undefined
}
