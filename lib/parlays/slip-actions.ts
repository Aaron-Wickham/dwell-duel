'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { MAX_PICKS } from './odds'
import { readSlip, writeSlip } from './slip'

// The boolean return is the toast's success signal (see ToastActionForm): true when the
// slip actually changed, false on every no-op branch, so a no-op never shows a false
// "Added"/"Removed" toast.
export async function addToSlipAction(outcomeId: string, _formData: FormData): Promise<boolean> {
  const { supabase, user } = await requireUser()
  if (!user) return false

  const slip = await readSlip()
  if (slip.includes(outcomeId)) return false

  const { data, error } = await supabase
    .from('market_outcomes')
    .select('id, market_id')
    .in('id', [...slip, outcomeId])
  if (error) throw error

  const marketOf = new Map((data ?? []).map((o) => [o.id, o.market_id]))
  const newMarketId = marketOf.get(outcomeId)
  if (!newMarketId) return false

  // One pick per market: a new pick from a market already in the slip replaces the old one.
  const kept = slip.filter((id) => marketOf.has(id) && marketOf.get(id) !== newMarketId)
  if (kept.length >= MAX_PICKS) return false

  await writeSlip([...kept, outcomeId])
  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
  revalidatePath('/', 'layout')
  return true
}

export async function removeFromSlipAction(outcomeId: string, _formData: FormData): Promise<boolean> {
  const slip = await readSlip()
  if (!slip.includes(outcomeId)) return false

  await writeSlip(slip.filter((id) => id !== outcomeId))
  // Refreshes the shared layout too, so the nav's balance and slip count stay current.
  revalidatePath('/', 'layout')
  return true
}
