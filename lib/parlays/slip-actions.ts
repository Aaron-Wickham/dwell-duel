'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { MAX_PICKS } from './odds'
import { readSlip, writeSlip } from './slip'

export async function addToSlipAction(outcomeId: string, _formData: FormData): Promise<void> {
  const { supabase, user } = await requireUser()
  if (!user) return

  const slip = await readSlip()
  if (slip.includes(outcomeId)) return

  const { data, error } = await supabase
    .from('market_outcomes')
    .select('id, market_id')
    .in('id', [...slip, outcomeId])
  if (error) throw error

  const marketOf = new Map((data ?? []).map((o) => [o.id, o.market_id]))
  const newMarketId = marketOf.get(outcomeId)
  if (!newMarketId) return

  // One pick per market: a new pick from a market already in the slip replaces the old one.
  const kept = slip.filter((id) => marketOf.has(id) && marketOf.get(id) !== newMarketId)
  if (kept.length >= MAX_PICKS) return

  await writeSlip([...kept, outcomeId])
  revalidatePath(`/markets/${newMarketId}`)
  revalidatePath('/parlays')
}

export async function removeFromSlipAction(outcomeId: string, _formData: FormData): Promise<void> {
  const slip = await readSlip()
  await writeSlip(slip.filter((id) => id !== outcomeId))
  revalidatePath('/markets/[id]', 'page')
  revalidatePath('/parlays')
}
