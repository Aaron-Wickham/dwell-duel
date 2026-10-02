import type { DbClient } from '@/lib/supabase/database'
import { lmsrState } from '@/lib/markets/pricing'
import { combineOdds, lockedOddsToBp, type LmsrLeg } from './odds'
import type { SlipEntry } from './parse-slip'

// Why a pick on a pool market can't be a parlay leg: the member created its market, or its market
// doesn't yet have the floor of other members' money (MIN_LEG_POOL from MIN_LEG_BETTORS, 0074). A
// pick on an lmsr market can always be one (0104).
export type LegBlock = 'own_market' | 'floor'

// An lmsr market's state, so the slip can quote a stake's exact payout (lmsrQuote, lmsrParlayQuote).
export type LmsrPick = LmsrLeg

export interface SlipPick {
  outcomeId: string
  outcomeLabel: string
  marketId: string
  marketTitle: string
  parlay: boolean
  // The market still takes bets: open, and before close_at.
  open: boolean
  // On a pool market, what a parlay leg on this pick would be priced at if its market closed now:
  // other members' DC on the market over their DC on the pick, no seed, 1.00x under the floor
  // (pick_quote, 0074). The real odds are set at close, so the slip shows this as an estimate.
  oddsBp: number
  legBlock: LegBlock | null
  // The real pools, no seed: what a solo payout is worked out from (soloPayout, 0074).
  outcomePool: number
  totalPool: number
  // Set only for a pick on an lmsr market (0102): its bet pays a fixed number of shares.
  lmsr?: LmsrPick
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
      .select(
        'id, label, pool_total, markets(id, title, status, close_at, pricing, liquidity, market_outcomes(id, pool_total, shares, q_offset))',
      )
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
    const market = row.markets
    const lmsr: LmsrPick | null =
      market.pricing === 'lmsr'
        ? {
            q: lmsrState(market.market_outcomes.map((o) => ({ shares: Number(o.shares), qOffset: Number(o.q_offset) }))),
            index: market.market_outcomes.findIndex((o) => o.id === row.id),
            liquidity: Number(market.liquidity),
          }
        : null
    return [
      {
        outcomeId: row.id,
        outcomeLabel: row.label,
        marketId: row.markets.id,
        marketTitle: row.markets.title,
        parlay: entry.parlay,
        open: row.markets.status === 'open' && new Date(row.markets.close_at).getTime() > now,
        oddsBp: lockedOddsToBp(quote.odds),
        legBlock: lmsr ? null : quote.own_market ? 'own_market' : quote.meets_floor ? null : 'floor',
        outcomePool: row.pool_total,
        totalPool: market.market_outcomes.reduce((sum, o) => sum + o.pool_total, 0),
        ...(lmsr ? { lmsr } : {}),
      },
    ]
  })

  const legBps = picks.flatMap((p) => (p.parlay ? [p.oddsBp] : []))
  return { picks, legBps, ...combineOdds(legBps) }
}
