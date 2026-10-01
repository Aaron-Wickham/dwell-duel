'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { friendlyError, type KnownError } from '@/lib/errors/friendly-error'
import { atLeast, getRole } from '@/lib/auth/roles'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'
import { afterAction, notifyMarketResult } from '@/lib/push/notify'

export type ActionState = { formError?: string; field?: 'reason' } | undefined

const NOT_VOIDABLE = 'only an unresolved, unvoided market can be voided'

// void_market's raises (0016, 0046, 0073) and the reason's length check (0073).
const VOID_MARKET_ERRORS: readonly KnownError<'reason'>[] = [
  { match: 'market not found', formError: 'This market no longer exists.' },
  { match: NOT_VOIDABLE, formError: 'Only an unresolved, unvoided market can be voided.' },
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

  if (error) {
    // A replay of a void that already committed is refused as not voidable; the market being
    // voided now is what was asked for. void_market checks status before permission, so only
    // someone who could have voided it is told it worked: an admin, or the creator while the
    // market is still open (after close only an admin may void).
    if (error.message === NOT_VOIDABLE) {
      const { data: market } = await supabase.from('markets').select('status, created_by, close_at').eq('id', marketId).maybeSingle()
      const creatorMayVoid = market?.created_by === user.id && new Date(market.close_at).getTime() > Date.now()
      if (market?.status === 'voided' && (creatorMayVoid || atLeast(await getRole(supabase), 'admin'))) {
        revalidatePath('/', 'layout')
        return undefined
      }
    }
    return friendlyError(error, VOID_MARKET_ERRORS, 'void_market failed')
  }

  afterAction(() => notifyMarketResult(marketId))
  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
  revalidatePath('/', 'layout')
  return undefined
}
