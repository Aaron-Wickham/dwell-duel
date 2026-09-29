import type { DbClient } from '@/lib/supabase/database'
import { lockedOddsToBp } from '@/lib/parlays/odds'

// supabase/migrations/0055_member_stats.sql: member_stats' one row. bigint and numeric columns are
// read through Number(), as economy_summary's are, in case PostgREST hands one back as a string.
export interface MemberStatsRow {
  bets_won: number
  bets_lost: number
  bets_refunded: number
  parlays_won: number
  parlays_lost: number
  parlays_refunded: number
  net_profit: number | string
  biggest_win: number | string | null
  biggest_win_market_id: string | null
  biggest_win_market_title: string | null
  best_parlay_multiplier: number | string | null
  best_parlay_payout: number | null
  markets_created: number
  tasks_completed: number
}

export interface WinLoss {
  won: number
  lost: number
  refunded: number
}

export interface MemberStats {
  bets: WinLoss
  parlays: WinLoss
  settled: number
  netProfit: number
  biggestWin: { amount: number; marketId: string; marketTitle: string } | null
  bestParlay: { multiplierBp: number; payout: number } | null
  marketsCreated: number
  tasksCompleted: number
}

export function toMemberStats(row: MemberStatsRow): MemberStats {
  const bets = { won: row.bets_won, lost: row.bets_lost, refunded: row.bets_refunded }
  const parlays = { won: row.parlays_won, lost: row.parlays_lost, refunded: row.parlays_refunded }
  const total = (r: WinLoss) => r.won + r.lost + r.refunded
  return {
    bets,
    parlays,
    settled: total(bets) + total(parlays),
    netProfit: Number(row.net_profit),
    biggestWin:
      row.biggest_win !== null && row.biggest_win_market_id !== null && row.biggest_win_market_title !== null
        ? { amount: Number(row.biggest_win), marketId: row.biggest_win_market_id, marketTitle: row.biggest_win_market_title }
        : null,
    bestParlay:
      row.best_parlay_multiplier !== null && row.best_parlay_payout !== null
        ? { multiplierBp: lockedOddsToBp(row.best_parlay_multiplier), payout: row.best_parlay_payout }
        : null,
    marketsCreated: row.markets_created,
    tasksCompleted: row.tasks_completed,
  }
}

export async function readMemberStats(supabase: DbClient, profileId: string): Promise<MemberStats> {
  const { data, error } = await supabase
    .rpc('member_stats', { p_profile_id: profileId })
    .single()
  if (error) throw error
  return toMemberStats(data!)
}
