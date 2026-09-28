import type { DbClient } from '@/lib/supabase/database'

export type AtStake = { wagers: number; dc: number }

// Open solo bets plus pending parlays, counted and summed in SQL (0045).
export async function getAtStake(supabase: DbClient): Promise<AtStake> {
  const { data, error } = await supabase.rpc('my_at_stake').single<{ wagers: number; dc: number | string }>()
  if (error) throw error
  return { wagers: data.wagers, dc: Number(data.dc) }
}
