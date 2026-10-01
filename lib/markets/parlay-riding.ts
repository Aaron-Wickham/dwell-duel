import type { DbClient } from '@/lib/supabase/database'

// market_parlay_riding (0096): per outcome, the stakes of pending parlays with a leg on it, each
// parlay's whole stake on every pick it rides on. Sums only, never whose. Display only: parlays are
// paid by DwellDuel, not from the pool, so this never feeds effectivePools, odds or charts.
export async function getParlayRiding(supabase: DbClient, marketId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('market_parlay_riding', { p_market_id: marketId })
  if (error) throw error
  return new Map((data ?? []).map((r) => [r.outcome_id, Number(r.riding)]))
}
