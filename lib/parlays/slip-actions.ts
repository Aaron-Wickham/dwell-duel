'use server'

import { revalidatePath } from 'next/cache'
import { requireUser } from '@/lib/auth/require-user'
import { MAX_SLIP_PICKS } from './parse-slip'
import { readSlip, writeSlip } from './slip'

// The boolean return is the toast's success signal (see ToastActionForm): true when the
// slip actually changed, false on every no-op branch, so a no-op never shows a false
// "Added"/"Removed" toast.
export async function addToSlipAction(outcomeId: string, _formData: FormData): Promise<boolean> {
  const { supabase, user } = await requireUser()
  if (!user) return false

  const slip = await readSlip()
  if (slip.some((e) => e.outcomeId === outcomeId)) return false

  const { data, error } = await supabase
    .from('market_outcomes')
    .select('id, market_id')
    .in('id', [...slip.map((e) => e.outcomeId), outcomeId])
  if (error) throw error

  const marketOf = new Map((data ?? []).map((o) => [o.id, o.market_id]))
  const newMarketId = marketOf.get(outcomeId)
  if (!newMarketId) return false

  // One pick per market: a new pick from a market already in the slip replaces the old one.
  const kept = slip.filter((e) => marketOf.has(e.outcomeId) && marketOf.get(e.outcomeId) !== newMarketId)
  if (kept.length >= MAX_SLIP_PICKS) return false

  await writeSlip([...kept, { outcomeId, parlay: false }])
  // Refreshes the shared layout too, so the slip button and panel stay current.
  revalidatePath('/', 'layout')
  return true
}

export async function removeFromSlipAction(outcomeId: string, _formData?: FormData): Promise<boolean> {
  const slip = await readSlip()
  if (!slip.some((e) => e.outcomeId === outcomeId)) return false

  await writeSlip(slip.filter((e) => e.outcomeId !== outcomeId))
  revalidatePath('/', 'layout')
  return true
}

export async function setPickModeAction(outcomeId: string, parlay: boolean): Promise<boolean> {
  const slip = await readSlip()
  const entry = slip.find((e) => e.outcomeId === outcomeId)
  if (!entry || entry.parlay === parlay) return false

  await writeSlip(slip.map((e) => (e.outcomeId === outcomeId ? { ...e, parlay } : e)))
  revalidatePath('/', 'layout')
  return true
}
