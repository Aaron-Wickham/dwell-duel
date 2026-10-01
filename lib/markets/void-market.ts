'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { friendlyError, type KnownError } from '@/lib/errors/friendly-error'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'
import { afterAction, notifyMarketResult } from '@/lib/push/notify'

export type ActionState = { formError?: string; field?: 'reason' } | undefined

// void_market's raises (0016, 0046, 0073) and the reason's length check (0073).
const VOID_MARKET_ERRORS: readonly KnownError<'reason'>[] = [
  { match: 'market not found', formError: 'This market no longer exists.' },
  { match: 'only an unresolved, unvoided market can be voided', formError: 'Only an unresolved, unvoided market can be voided.' },
  { match: 'only the market creator or an admin can void this market', formError: 'Only the market’s creator or an admin can void it.' },
  { match: 'this market has closed, so only an admin can void it', formError: 'This market has closed, so only an admin can void it.' },
  { match: 'say why this market is voided', formError: 'Say why this market is being voided.', field: 'reason' },
  { match: 'markets_void_reason_length', formError: tooLong('Reason', TEXT_LIMITS.voidReason), field: 'reason' },
]

export async function voidMarketAction(
  marketId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const reason = String(formData.get('reason') ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (!reason) return { formError: 'Say why this market is being voided.', field: 'reason' }
  if (reason.length > TEXT_LIMITS.voidReason) return { formError: tooLong('Reason', TEXT_LIMITS.voidReason), field: 'reason' }

  const { error } = await supabase.rpc('void_market', { p_market_id: marketId, p_reason: reason })

  if (error) return friendlyError(error, VOID_MARKET_ERRORS, 'void_market failed')

  afterAction(() => notifyMarketResult(marketId))
  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
  revalidatePath('/', 'layout')
  return undefined
}
