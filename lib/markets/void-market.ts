'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { friendlyError, type KnownError } from '@/lib/errors/friendly-error'
import { atLeast, getRole } from '@/lib/auth/roles'
import { afterAction, notifyMarketResult } from '@/lib/push/notify'

export type ActionState = { formError?: string } | undefined

const NOT_VOIDABLE = 'only an unresolved, unvoided market can be voided'

// void_market's raises (0016, 0046).
const VOID_MARKET_ERRORS: readonly KnownError<never>[] = [
  { match: 'market not found', formError: 'This market no longer exists.' },
  { match: NOT_VOIDABLE, formError: 'Only an unresolved, unvoided market can be voided.' },
  { match: 'only the market creator or an admin can void this market', formError: 'Only the market’s creator or an admin can void it.' },
]

export async function voidMarketAction(
  marketId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const { error } = await supabase.rpc('void_market', { p_market_id: marketId })

  if (error) {
    // A replay of a void that already committed is refused as not voidable; the market being
    // voided now is what was asked for. void_market checks status before permission, so only
    // someone who could have voided it (its creator, or an admin) is told it worked.
    if (error.message === NOT_VOIDABLE) {
      const { data: market } = await supabase.from('markets').select('status, created_by').eq('id', marketId).maybeSingle()
      if (market?.status === 'voided' && (market.created_by === user.id || atLeast(await getRole(supabase), 'admin'))) {
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
