import type { DbClient } from '@/lib/supabase/database'
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
  // The real pools, no seed: what a solo payout is worked out from (soloPayout, 0074).
  outcomePool: number
  totalPool: number
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
      .select('id, label, pool_total, markets(id, title, status, close_at, market_outcomes(pool_total))')
      .in('id', ids),
    supabase.rpc('pick_quotes', { p_outcome_ids: ids }),
  ])
  if (error) throw error
  // Someone no longer invited reads no outcomes (RLS) and is refused quotes: an empty slip, either way.
  if (quoteError && quoteError.code !== '42501') throw quoteError

  const rows = data ?? []
  const quoteOf = new Map((quotes ?? []).map((q) => [q.outcome_id, q]))
  const now = Date.now()

  const picks = entries.flatMap((entry): SlipPick[] => {
    const row = rows.find((r) => r.id === entry.outcomeId)
    const quote = quoteOf.get(entry.outcomeId)
    if (!row || !quote) return []
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
        outcomePool: row.pool_total,
        totalPool: row.markets.market_outcomes.reduce((sum, o) => sum + o.pool_total, 0),
      },
    ]
  })

  const legBps = picks.flatMap((p) => (p.parlay ? [p.oddsBp] : []))
  return { picks, legBps, ...combineOdds(legBps) }
}
