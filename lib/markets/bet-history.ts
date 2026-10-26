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

// update_market (0073) refuses a new title once anyone but the creator has bet, solo or in a
// parlay, so the edit dialog shows the title read-only rather than lose the rest of the edit with it.
export async function othersHaveBet(supabase: DbClient, marketId: string, createdBy: string): Promise<boolean> {
  const [bets, legs] = await Promise.all([
    supabase.from('bets').select('id', { count: 'exact', head: true }).eq('market_id', marketId).neq('profile_id', createdBy),
    supabase
      .from('parlay_legs')
      .select('id, parlays!inner(profile_id)', { count: 'exact', head: true })
      .eq('market_id', marketId)
      .neq('parlays.profile_id', createdBy),
  ])
  if (bets.error) throw bets.error
  if (legs.error) throw legs.error
  return (bets.count ?? 0) > 0 || (legs.count ?? 0) > 0
}
