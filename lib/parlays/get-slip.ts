import type { SupabaseClient } from '@supabase/supabase-js'
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
  // Null while nobody has bet on this outcome: there's nothing yet to lock a parlay leg's odds to.
  oddsBp: number | null
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

interface OutcomeRow {
  id: string
  label: string
  pool_total: number
  markets: { id: string; title: string; status: string; close_at: string; market_outcomes: { pool_total: number }[] }
}

export async function getSlipView(supabase: SupabaseClient, entries: SlipEntry[]): Promise<SlipView> {
  if (entries.length === 0) return EMPTY_SLIP

  const { data, error } = await supabase
    .from('market_outcomes')
    .select('id, label, pool_total, markets(id, title, status, close_at, market_outcomes(pool_total))')
    .in(
      'id',
      entries.map((e) => e.outcomeId),
    )
  if (error) throw error

  const rows = (data ?? []) as unknown as OutcomeRow[]
  const now = Date.now()

  const picks = entries.flatMap((entry): SlipPick[] => {
    const row = rows.find((r) => r.id === entry.outcomeId)
    if (!row) return []
    const totalPool = row.markets.market_outcomes.reduce((sum, o) => sum + o.pool_total, 0)
    return [
      {
        outcomeId: row.id,
        outcomeLabel: row.label,
        marketId: row.markets.id,
        marketTitle: row.markets.title,
        parlay: entry.parlay,
        open: row.markets.status === 'open' && new Date(row.markets.close_at).getTime() > now,
        oddsBp: legOddsBp(totalPool, row.pool_total),
        outcomePool: row.pool_total,
        totalPool,
      },
    ]
  })

  const legBps = picks.flatMap((p) => (p.parlay && p.oddsBp !== null ? [p.oddsBp] : []))
  return { picks, legBps, ...combineOdds(legBps) }
}
