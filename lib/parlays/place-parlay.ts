'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { combineOdds, potentialPayout } from './odds'
import { readSlip, writeSlip } from './slip'

export type PlaceParlayState =
  | { formError?: string; placed?: { multiplier: number; potentialPayout: number } }
  | undefined

export async function placeParlayAction(_prevState: PlaceParlayState, formData: FormData): Promise<PlaceParlayState> {
  const { supabase, user } = await requireUser()
  if (!user) return { formError: 'Not signed in.' }

  const stake = Number(formData.get('stake'))
  if (!Number.isInteger(stake) || stake <= 0) return { formError: 'Enter a whole number of DC greater than 0.' }

  const { data: parlayId, error } = await supabase.rpc('place_parlay', {
    p_outcome_ids: await readSlip(),
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

  const { multiplier } = combineOdds((legs ?? []).map((l) => Number(l.locked_odds)))

  return { placed: { multiplier, potentialPayout: potentialPayout(stake, multiplier) } }
}
