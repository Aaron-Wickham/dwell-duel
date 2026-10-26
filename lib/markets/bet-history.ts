import type { DbClient } from '@/lib/supabase/database'

// delete_market (0040) refuses a market with live bets, cancelled bets or parlay legs. The market
// page already knows the pool is empty (no live bets); these two head counts cover the rest, so
// "Delete this market" only shows when the delete would go through (#221). Two counts rather than
// a can_delete_market() function, so this needs no migration.
export async function hasBetHistory(supabase: DbClient, marketId: string): Promise<boolean> {
  const [cancelled, legs] = await Promise.all([
    supabase.from('cancelled_bets').select('id', { count: 'exact', head: true }).eq('market_id', marketId),
    supabase.from('parlay_legs').select('id', { count: 'exact', head: true }).eq('market_id', marketId),
  ])
  if (cancelled.error) throw cancelled.error
  if (legs.error) throw legs.error
  return (cancelled.count ?? 0) > 0 || (legs.count ?? 0) > 0
}
