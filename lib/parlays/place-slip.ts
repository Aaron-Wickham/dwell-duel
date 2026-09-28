'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { insufficientBalanceMessage, isBalanceCheckViolation } from '@/lib/errors/balance-error'
import { combineOdds, lockedOddsToBp, potentialPayout } from './odds'
import { parseSlipError } from './slip-errors'
import { readSlip, writeSlip } from './slip'

export type PlaceSlipState =
  | {
      formError?: string
      pickErrors?: Record<string, string>
      parlayError?: string
      placed?: { solos: number; parlay: { legs: number; multiplierBp: number; potentialPayout: number } | null }
    }
  | undefined

const WHOLE_DC = 'Enter a whole number of DC greater than 0.'

function stakeOf(value: FormDataEntryValue | null): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

// The form posts each pick it shows as `pick=<outcome id>:solo|parlay`, with `stake:<outcome id>`
// for each Solo pick and one `parlay_stake`. Sending the modes, rather than re-reading them from
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
  const singles: { outcome_id: string; amount: number }[] = []
  for (const [id, mode] of picks) {
    if (mode !== 'solo') continue
    const amount = stakeOf(formData.get(`stake:${id}`))
    if (amount === null) pickErrors[id] = WHOLE_DC
    else singles.push({ outcome_id: id, amount })
  }

  const legs = picks.filter(([, mode]) => mode === 'parlay').map(([id]) => id)
  let parlayStake = 0
  let parlayError: string | undefined
  if (legs.length === 1) parlayError = 'A parlay needs at least 2 picks. Add another, or switch this one to Solo.'
  else if (legs.length > 1) {
    const stake = stakeOf(formData.get('parlay_stake'))
    if (stake === null) parlayError = WHOLE_DC
    else parlayStake = stake
  }
  if (Object.keys(pickErrors).length > 0 || parlayError) return { pickErrors, parlayError }

  const { data: parlayId, error } = await supabase.rpc('place_slip', {
    p_singles: singles,
    p_parlay_outcome_ids: legs,
    p_parlay_stake: parlayStake,
  })
  if (error) {
    if (isBalanceCheckViolation(error)) {
      const { data: profile } = await supabase.from('profiles').select('balance').eq('id', user.id).maybeSingle()
      if (profile) return { formError: insufficientBalanceMessage(profile.balance) }
    }
    return parseSlipError(error.message)
  }

  await writeSlip([])
  // Refreshes the shared layout too, so the balance, the slip and every bet list stay current.
  revalidatePath('/', 'layout')

  let parlay: NonNullable<NonNullable<PlaceSlipState>['placed']>['parlay'] = null
  if (parlayId) {
    const { data: lockedLegs } = await supabase.from('parlay_legs').select('locked_odds').eq('parlay_id', parlayId as string)
    const legBps = (lockedLegs ?? []).map((l) => lockedOddsToBp(l.locked_odds))
    parlay = { legs: legs.length, multiplierBp: combineOdds(legBps).multiplierBp, potentialPayout: potentialPayout(parlayStake, legBps) }
  }
  return { placed: { solos: singles.length, parlay } }
}
