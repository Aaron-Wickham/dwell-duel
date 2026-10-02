import type { DbClient } from '@/lib/supabase/database'
import { lmsrState } from '@/lib/markets/pricing'
import type { LmsrLeg } from './odds'
import type { SlipEntry } from './parse-slip'

// An lmsr market's state, so the slip can quote a stake's exact payout (lmsrQuote, lmsrParlayQuote).
export type LmsrPick = LmsrLeg

export interface SlipPick {
  outcomeId: string
  outcomeLabel: string
  marketId: string
  marketTitle: string
  parlay: boolean
  // The market still takes bets: open, before close_at, and priced by LMSR. No pool market has
  // been open since 0105, so a pick left on one is no longer available.
  open: boolean
  // Unset only for a pick on a pool market.
  lmsr?: LmsrPick
}

export interface SlipView {
  picks: SlipPick[]
}

export const EMPTY_SLIP: SlipView = { picks: [] }

export async function getSlipView(supabase: DbClient, entries: SlipEntry[]): Promise<SlipView> {
  if (entries.length === 0) return EMPTY_SLIP
  const ids = entries.map((e) => e.outcomeId)

  // Someone no longer invited reads no outcomes (RLS): an empty slip.
  const { data, error } = await supabase
    .from('market_outcomes')
    .select('id, label, markets(id, title, status, close_at, pricing, liquidity, market_outcomes(id, shares, q_offset))')
    .in('id', ids)
  if (error) throw error

  const rows = data ?? []
  const now = Date.now()

  const picks = entries.flatMap((entry): SlipPick[] => {
    const row = rows.find((r) => r.id === entry.outcomeId)
    if (!row) return []
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
        marketId: market.id,
        marketTitle: market.title,
        parlay: entry.parlay,
        open: lmsr !== null && market.status === 'open' && new Date(market.close_at).getTime() > now,
        ...(lmsr ? { lmsr } : {}),
      },
    ]
  })

  return { picks }
}
