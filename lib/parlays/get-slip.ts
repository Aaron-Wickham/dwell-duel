import type { DbClient } from '@/lib/supabase/database'
import { effectivePools } from '@/lib/markets/odds'
import { combineOdds, legOddsBp } from './odds'
import type { SlipEntry } from './parse-slip'

export interface SlipPick {
  outcomeId: string
  outcomeLabel: string
  marketId: string
  marketTitle: string
  parlay: boolean
  // The market still takes bets: open, and before close_at.
  open: boolean
  // The parlay leg's odds, as place_parlay would lock them: without your own stakes on this market
  // (0046), so betting against yourself can't pump them. Null only for an unseeded outcome with no
  // one else's money on it (0041 seeds every open market, so in practice a pick always has odds).
  oddsBp: number | null
  // Effective pools, seed included, as resolve_market pays out on (lib/markets/odds.ts).
  outcomePool: number
  totalPool: number
}

export interface SlipView {
  picks: SlipPick[]
  // The Parlay picks' odds, in slip order, and what they multiply to.
  legBps: number[]
  multiplierBp: number
  capped: boolean
}

export const EMPTY_SLIP: SlipView = { picks: [], legBps: [], ...combineOdds([]) }

export async function getSlipView(supabase: DbClient, entries: SlipEntry[], userId: string): Promise<SlipView> {
  if (entries.length === 0) return EMPTY_SLIP

  const { data, error } = await supabase
    .from('market_outcomes')
    .select('id, label, pool_total, markets(id, title, status, close_at, seed_per_outcome, market_outcomes(pool_total))')
    .in(
      'id',
      entries.map((e) => e.outcomeId),
    )
  if (error) throw error

  const rows = data ?? []
  const now = Date.now()

  // Your own stakes on these markets, per market and per outcome, left out of the parlay odds.
  const marketIds = [...new Set(rows.map((r) => r.markets.id))]
  const ownByMarket = new Map<string, number>()
  const ownByOutcome = new Map<string, number>()
  if (marketIds.length > 0) {
    const { data: own, error: ownErr } = await supabase
      .from('bets')
      .select('market_id, outcome_id, amount')
      .eq('profile_id', userId)
      .in('market_id', marketIds)
    if (ownErr) throw ownErr
    for (const b of own ?? []) {
      ownByMarket.set(b.market_id, (ownByMarket.get(b.market_id) ?? 0) + b.amount)
      ownByOutcome.set(b.outcome_id, (ownByOutcome.get(b.outcome_id) ?? 0) + b.amount)
    }
  }

  const picks = entries.flatMap((entry): SlipPick[] => {
    const row = rows.find((r) => r.id === entry.outcomeId)
    if (!row) return []
    const realTotal = row.markets.market_outcomes.reduce((sum, o) => sum + o.pool_total, 0)
    const { pool, total } = effectivePools(row.pool_total, realTotal, row.markets.seed_per_outcome, row.markets.market_outcomes.length)
    const others = effectivePools(
      row.pool_total - (ownByOutcome.get(row.id) ?? 0),
      realTotal - (ownByMarket.get(row.markets.id) ?? 0),
      row.markets.seed_per_outcome,
      row.markets.market_outcomes.length,
    )
    return [
      {
        outcomeId: row.id,
        outcomeLabel: row.label,
        marketId: row.markets.id,
        marketTitle: row.markets.title,
        parlay: entry.parlay,
        open: row.markets.status === 'open' && new Date(row.markets.close_at).getTime() > now,
        oddsBp: legOddsBp(others.total, others.pool),
        outcomePool: pool,
        totalPool: total,
      },
    ]
  })

  const legBps = picks.flatMap((p) => (p.parlay && p.oddsBp !== null ? [p.oddsBp] : []))
  return { picks, legBps, ...combineOdds(legBps) }
}
