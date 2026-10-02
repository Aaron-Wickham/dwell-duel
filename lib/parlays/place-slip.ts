'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { GENERIC_ERROR } from '@/lib/errors/friendly-error'
import { isDeliberateRaise } from '@/lib/errors/deliberate-raise'
import { reportError } from '@/lib/observability/report'
import { insufficientBalanceMessage, isBalanceCheckViolation } from '@/lib/errors/balance-error'
import { factorBp } from './odds'
import { parseSlipError } from './slip-errors'
import { readSlip, writeSlip } from './slip'

// What place_slip_v4 (0104, as place_slip_v2 in 0072) returns: what was placed, and whether this
// call replayed an earlier attempt's key. A key claimed by the build before 0072 stored only the
// parlay id, so `solos` and `picks` can be missing on a replay.
type SlipSummary = { parlay_id: string | null; solos?: number; picks?: string[]; replayed: boolean }

export type PlaceSlipState =
  | {
      formError?: string
      pickErrors?: Record<string, string>
      parlayError?: string
      // A pick's or the parlay's price moved by more than 2% since the slip showed it (0102, 0104);
      // the slip now shows the new one.
      priceMoved?: boolean
      // The stake each refused pick (by outcome id) or the parlay ('parlay') was sent with: the
      // slip drops the price-moved message once that stake changes, since the figure it names is stale.
      movedStakes?: Record<string, string>
      placed?: {
        solos: number
        // Its multiplier and payout, fixed when it was placed (0104).
        parlay: { legs: number; multiplierBp: number; potentialPayout: number } | null
        // True when this was a retry of a slip that had already gone through (#226): the counts are
        // what that earlier attempt placed, not what the slip holds now.
        replayed?: boolean
      }
    }
  | undefined

const WHOLE_DC = 'Enter a whole number of DC greater than 0.'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function stakeOf(value: FormDataEntryValue | null): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

// The form posts each pick it shows as `pick=<outcome id>:solo|parlay`, with `stake:<outcome id>`
// for each Solo pick, `payout:<outcome id>` for one on an lmsr market (what the slip showed it
// paying), one `parlay_stake`, and `parlay_payout` for a parlay on lmsr markets. Sending the modes, rather than re-reading them from
// the cookie, means a place right after a Solo / Parlay switch uses what the member saw.
export async function placeSlipAction(_prevState: PlaceSlipState, formData: FormData): Promise<PlaceSlipState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const inSlip = new Set((await readSlip()).map((e) => e.outcomeId))
  const picks = formData
    .getAll('pick')
    .map((v) => String(v).split(':'))
    .filter(([id, mode]) => inSlip.has(id) && (mode === 'solo' || mode === 'parlay'))
  if (picks.length === 0) return { formError: 'Your slip is empty.' }

  const pickErrors: Record<string, string> = {}
  const singles: { outcome_id: string; amount: number; payout?: number }[] = []
  for (const [id, mode] of picks) {
    if (mode !== 'solo') continue
    const amount = stakeOf(formData.get(`stake:${id}`))
    const payout = formData.has(`payout:${id}`) ? Number(formData.get(`payout:${id}`)) : null
    if (amount === null) pickErrors[id] = WHOLE_DC
    else singles.push({ outcome_id: id, amount, ...(payout !== null && Number.isInteger(payout) ? { payout } : {}) })
  }

  const legs = picks.filter(([, mode]) => mode === 'parlay').map(([id]) => id)
  let parlayStake = 0
  let parlayPayout: number | undefined
  let parlayError: string | undefined
  if (legs.length === 1) parlayError = 'A parlay needs at least 2 picks. Add another, or switch this one to Solo.'
  else if (legs.length > 1) {
    const stake = stakeOf(formData.get('parlay_stake'))
    if (stake === null) parlayError = WHOLE_DC
    else parlayStake = stake
    const shown = Number(formData.get('parlay_payout'))
    if (formData.has('parlay_payout') && Number.isInteger(shown)) parlayPayout = shown
  }
  if (Object.keys(pickErrors).length > 0 || parlayError) return { pickErrors, parlayError }

  const attemptKey = String(formData.get('idempotency_key') ?? '')
  const { data, error } = await supabase.rpc('place_slip_v4', {
    p_singles: singles,
    p_parlay_outcome_ids: legs,
    p_parlay_stake: parlayStake,
    ...(parlayPayout !== undefined ? { p_parlay_payout: parlayPayout } : {}),
    p_idempotency_key: UUID.test(attemptKey) ? attemptKey : undefined,
  })
  if (error) {
    if (isBalanceCheckViolation(error)) {
      const { data: profile } = await supabase.from('profiles').select('balance').eq('id', user.id).maybeSingle()
      if (profile) return { formError: insufficientBalanceMessage(profile.balance) }
    }
    if (!isDeliberateRaise(error)) {
      reportError('place_slip failed', error)
      return { formError: GENERIC_ERROR }
    }
    const refused = parseSlipError(error.message)
    if (!refused.priceMoved) return refused
    // The slip re-reads its picks, so it shows (and next sends) the payout the price gives now.
    revalidatePath('/', 'layout')
    const movedStakes: Record<string, string> = {}
    for (const id of Object.keys(refused.pickErrors ?? {})) movedStakes[id] = String(formData.get(`stake:${id}`) ?? '')
    if (refused.parlayError) movedStakes.parlay = String(formData.get('parlay_stake') ?? '')
    return { ...refused, movedStakes }
  }

  const summary = (data ?? { parlay_id: null, replayed: false }) as SlipSummary
  const parlayId = summary.parlay_id

  // A fresh place took everything in the slip. A replay took only what the earlier attempt held, so
  // any pick added since stays for the member to place; an old-format key can't say, so it clears.
  if (summary.replayed && summary.picks) {
    const placedIds = new Set(summary.picks)
    await writeSlip((await readSlip()).filter((e) => !placedIds.has(e.outcomeId)))
  } else {
    await writeSlip([])
  }
  // Refreshes the shared layout too, so the balance, the slip and every bet list stay current.
  revalidatePath('/', 'layout')

  let parlay: NonNullable<NonNullable<PlaceSlipState>['placed']>['parlay'] = null
  if (parlayId) {
    const { data: row } = await supabase
      .from('parlays')
      .select('multiplier, payout, parlay_legs(outcome_id)')
      .eq('id', parlayId)
      .maybeSingle()
    // Only a replay of an attempt from before 0104 finds a parlay with no fixed payout, and then
    // the message names no parlay rather than guess at one.
    if (row && row.multiplier !== null && row.payout !== null) {
      parlay = { legs: row.parlay_legs.length, multiplierBp: factorBp(row.multiplier), potentialPayout: row.payout }
    }
  }
  const solos = summary.replayed ? (summary.solos ?? 0) : singles.length
  return { placed: { solos, parlay, ...(summary.replayed ? { replayed: true } : {}) } }
}
