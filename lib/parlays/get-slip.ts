import type { DbClient } from '@/lib/supabase/database'
import { effectivePools } from '@/lib/markets/odds'
import { combineOdds, lockedOddsToBp } from './odds'
import type { SlipEntry } from './parse-slip'

// Why a pick can't be a parlay leg: the member created its market, or its market doesn't yet have
// the floor of other members' money (MIN_LEG_POOL from MIN_LEG_BETTORS, 0074).
export type LegBlock = 'own_market' | 'floor'

export interface SlipPick {
  outcomeId: string
  outcomeLabel: string
  marketId: string
  marketTitle: string
  parlay: boolean
  // The market still takes bets: open, and before close_at.
  open: boolean
  // What a parlay leg on this pick would be priced at if its market closed now: other members' DC
  // on the market over their DC on the pick, no seed, 1.00x under the floor (pick_quote, 0074). The
  // real odds are set at close, so the slip shows this as an estimate.
  oddsBp: number
  legBlock: LegBlock | null
  // Effective pools, seed included, as resolve_market_core pays on (lib/markets/odds.ts).
  outcomePool: number
  totalPool: number
  // The real pools, and the opposing stake that limits the seed's top-up on a solo payout.
  realPool: number
  realTotal: number
  opposing: number
}

export interface SlipView {
  picks: SlipPick[]
  // The Parlay picks' estimated odds, in slip order, and what they multiply to.
  legBps: number[]
  multiplierBp: number
  capped: boolean
}

export const EMPTY_SLIP: SlipView = { picks: [], legBps: [], ...combineOdds([]) }

export async function getSlipView(supabase: DbClient, entries: SlipEntry[]): Promise<SlipView> {
  if (entries.length === 0) return EMPTY_SLIP
  const ids = entries.map((e) => e.outcomeId)

  const [{ data, error }, { data: quotes, error: quoteError }] = await Promise.all([
    supabase
      .from('market_outcomes')
      .select('id, label, pool_total, markets(id, title, status, close_at, seed_per_outcome, market_outcomes(pool_total))')
      .in('id', ids),
    supabase.rpc('pick_quotes', { p_outcome_ids: ids }),
  ])
  if (error) throw error
  if (quoteError) throw quoteError

  const rows = data ?? []
  const quoteOf = new Map((quotes ?? []).map((q) => [q.outcome_id, q]))
  const now = Date.now()

  const picks = entries.flatMap((entry): SlipPick[] => {
    const row = rows.find((r) => r.id === entry.outcomeId)
    const quote = quoteOf.get(entry.outcomeId)
    if (!row || !quote) return []
    const realTotal = row.markets.market_outcomes.reduce((sum, o) => sum + o.pool_total, 0)
    const { pool, total } = effectivePools(row.pool_total, realTotal, row.markets.seed_per_outcome, row.markets.market_outcomes.length)
    return [
      {
        outcomeId: row.id,
        outcomeLabel: row.label,
        marketId: row.markets.id,
        marketTitle: row.markets.title,
        parlay: entry.parlay,
        open: row.markets.status === 'open' && new Date(row.markets.close_at).getTime() > now,
        oddsBp: lockedOddsToBp(quote.odds),
        legBlock: quote.own_market ? 'own_market' : quote.meets_floor ? null : 'floor',
        outcomePool: pool,
        totalPool: total,
        realPool: row.pool_total,
        realTotal,
        opposing: Number(quote.opposing),
      },
    ]
  })

  const legBps = picks.flatMap((p) => (p.parlay ? [p.oddsBp] : []))
  return { picks, legBps, ...combineOdds(legBps) }
}
