'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { combineOdds, lockedOddsToBp, potentialPayout } from './odds'
import { getSlipView } from './get-slip'
import { readSlip, writeSlip } from './slip'

export type PlaceParlayState =
  | { formError?: string; placed?: { multiplierBp: number; potentialPayout: number } }
  | undefined

export async function placeParlayAction(_prevState: PlaceParlayState, formData: FormData): Promise<PlaceParlayState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const stake = Number(formData.get('stake'))
  if (!Number.isInteger(stake) || stake <= 0) return { formError: 'Enter a whole number of DC greater than 0.' }

  // Only the picks the page can show, so an id it silently dropped can't block placement.
  const { picks } = await getSlipView(supabase, await readSlip())

  const { data: parlayId, error } = await supabase.rpc('place_parlay', {
    p_outcome_ids: picks.map((p) => p.outcomeId),
    p_stake: stake,
  })
  if (error) return { formError: error.message }

  await writeSlip([])

  revalidatePath('/parlays')
  revalidatePath('/')

  const { data: legs, error: legsErr } = await supabase
    .from('parlay_legs')
    .select('locked_odds')
    .eq('parlay_id', parlayId as string)
  if (legsErr) return {}

  const legBps = (legs ?? []).map((l) => lockedOddsToBp(l.locked_odds))
  return { placed: { multiplierBp: combineOdds(legBps).multiplierBp, potentialPayout: potentialPayout(stake, legBps) } }
}
