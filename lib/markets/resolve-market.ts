'use server'

import { revalidatePath } from 'next/cache'
import { revalidateGroupReads } from '@/lib/cache/group-reads'
import { requireUser } from '@/lib/auth/require-user'
import { TEXT_LIMITS, tooLong } from '@/lib/forms/limits'
import { GENERIC_ERROR, SIGNED_OUT_ERROR, friendlyError, type KnownError } from '@/lib/errors/friendly-error'
import { isDeliberateRaise } from '@/lib/errors/deliberate-raise'
import { reportError } from '@/lib/observability/report'
import { clawbackMessage, parseClawbackError } from '@/lib/markets/clawback'
import { afterAction, notifyMarketResult } from '@/lib/push/notify'
import type { DbClient } from '@/lib/supabase/database'
import type { ProofRecord } from '@/lib/proof/types'

export type ActionState = { formError?: string; field?: 'outcome' | 'note' } | undefined

// resolve_market_core's exact text (0066); an override must name a different outcome.
const SAME_OUTCOME = 'that outcome is already the result'
const ALREADY_RESOLVED = 'only an admin can change an already-resolved market'
const SAME_OUTCOME_MESSAGE = 'That outcome is already the result, so there’s nothing to override.'

type ResolveField = NonNullable<NonNullable<ActionState>['field']>

// The raises of resolve_market_core (0102), resolve_market and its proof check (0042) and
// resolve_over_under (0043), each saying what to do next.
const RESOLVE_ERRORS: readonly KnownError<ResolveField>[] = [
  { match: 'market not found', formError: 'This market is gone. Go back to Markets.' },
  { match: 'market was voided', formError: 'This market was called off, so it can’t be resolved.' },
  { match: ALREADY_RESOLVED, formError: 'This market already has a result. Only an admin can change it.' },
  {
    match: 'only the market creator, a reviewer or an admin can resolve this market',
    formError: 'Only the market’s creator, a reviewer or an admin can resolve this market.',
  },
  { match: 'market has not closed yet', formError: 'This market hasn’t closed yet. Resolve it once betting closes.' },
  {
    match: 'you have a stake in this market, so someone else resolves it',
    formError: 'You have a stake in this market, so a reviewer or an admin resolves it.',
  },
  { match: 'outcome does not belong to this market', formError: 'That outcome isn’t one of this market’s. Refresh and choose again.', field: 'outcome' },
  { match: 'say why this outcome won', formError: 'Say why this outcome won.', field: 'note' },
  { match: 'enter the actual result', formError: 'Enter the actual result.', field: 'outcome' },
  { match: "the result can't equal the line", formError: 'The result can’t equal the line. Check the number you entered.', field: 'outcome' },
  { match: 'add at most 10 attachments', formError: 'Add at most 10 attachments.' },
  { match: 'links must start with http:// or https://', formError: 'Links must start with http:// or https://.' },
  { match: "that file can't be attached here", formError: 'That file can’t be attached here. Remove it and attach another.' },
  { match: "an attachment didn't finish uploading; try again", formError: 'An attachment didn’t finish uploading. Try again.' },
]

export async function resolveMarketAction(
  marketId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: SIGNED_OUT_ERROR }

  const outcomeId = String(formData.get('outcome_id') ?? '')
  const actualRaw = formData.get('actual')
  const note = String(formData.get('note') ?? '')
    .replace(/\r\n/g, '\n')
    .trim()
  if (actualRaw === null && !outcomeId) return { formError: 'Choose the winning outcome.', field: 'outcome' }
  const actual = actualRaw === null ? null : Number(actualRaw)
  if (actual !== null && (!Number.isFinite(actual) || actual < 0 || String(actualRaw).trim() === '')) {
    return { formError: 'Enter the actual result.', field: 'outcome' }
  }
  if (!note) return { formError: 'Say why this outcome won.', field: 'note' }
  if (note.length > TEXT_LIMITS.resolutionNote) return { formError: tooLong('Note', TEXT_LIMITS.resolutionNote), field: 'note' }

  let attachments: ProofRecord[] = []
  try {
    attachments = JSON.parse(String(formData.get('attachments') || '[]'))
  } catch {
    return { formError: 'Your attachments didn’t come through. Try again.' }
  }

  if (attachments.some((a) => a.kind === 'link' && a.url.length > TEXT_LIMITS.proofLink)) {
    return { formError: tooLong('Link', TEXT_LIMITS.proofLink) }
  }

  const { error } =
    actual !== null
      ? await supabase.rpc('resolve_over_under', { p_market_id: marketId, p_actual: actual, p_note: note, p_attachments: attachments })
      : await supabase.rpc('resolve_market', { p_market_id: marketId, p_outcome_id: outcomeId, p_note: note, p_attachments: attachments })

  if (error) {
    // A replay of a resolve that already committed (Next re-sends an action whose response was
    // lost) is refused as "already the result" or, for a non-admin, as already resolved. If this
    // member's own resolution to this outcome is the live one, that's success, not an error.
    if (
      outcomeId &&
      (error.message === SAME_OUTCOME || error.message === ALREADY_RESOLVED) &&
      (await resolvedByMeTo(supabase, marketId, outcomeId, user.id))
    ) {
      revalidatePath('/', 'layout')
      revalidateGroupReads()
      return undefined
    }
    if (error.message === SAME_OUTCOME) return { formError: SAME_OUTCOME_MESSAGE, field: 'outcome' }
    const short = parseClawbackError(error.message)
    const clawback = short && clawbackMessage(short)
    if (clawback) return { formError: clawback, field: 'outcome' }
    if (!isDeliberateRaise(error)) {
      reportError('resolve failed', error)
      return { formError: GENERIC_ERROR, field: 'outcome' }
    }
    return { field: 'outcome', ...friendlyError(error, RESOLVE_ERRORS, 'resolve refused with unmapped text') }
  }

  afterAction(() => notifyMarketResult(marketId))
  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
  revalidatePath('/', 'layout')
  revalidateGroupReads()
  return undefined
}

async function resolvedByMeTo(supabase: DbClient, marketId: string, outcomeId: string, userId: string) {
  const { data } = await supabase
    .from('market_resolutions')
    .select('id')
    .eq('market_id', marketId)
    .eq('resolved_by', userId)
    .eq('outcome_id', outcomeId)
    .is('reversed_at', null)
    .limit(1)
    .maybeSingle()
  return Boolean(data)
}
