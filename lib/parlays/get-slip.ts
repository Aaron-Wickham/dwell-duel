import type { SupabaseClient } from '@supabase/supabase-js'
import { combineOdds, legOdds } from './odds'

export interface SlipPick {
  outcomeId: string
  outcomeLabel: string
  marketId: string
  marketTitle: string
  odds: number | null
  available: boolean
}

export interface SlipView {
  picks: SlipPick[]
  multiplier: number
  capped: boolean
  canPlace: boolean
}

interface OutcomeRow {
  id: string
  label: string
  pool_total: number
  markets: { id: string; title: string; status: string; close_at: string; market_outcomes: { pool_total: number }[] }
}

export async function getSlipView(supabase: SupabaseClient, outcomeIds: string[]): Promise<SlipView> {
  if (outcomeIds.length === 0) return { picks: [], multiplier: 1, capped: false, canPlace: false }

  const { data, error } = await supabase
    .from('market_outcomes')
    .select('id, label, pool_total, markets(id, title, status, close_at, market_outcomes(pool_total))')
    .in('id', outcomeIds)
  if (error) throw error

  const rows = (data ?? []) as unknown as OutcomeRow[]
  const now = Date.now()

  const picks = outcomeIds.flatMap((id): SlipPick[] => {
    const row = rows.find((r) => r.id === id)
    if (!row) return []
    const totalPool = row.markets.market_outcomes.reduce((sum, o) => sum + o.pool_total, 0)
    const odds = legOdds(totalPool, row.pool_total)
    const available = row.markets.status === 'open' && new Date(row.markets.close_at).getTime() > now && odds !== null
    return [
      {
        outcomeId: row.id,
        outcomeLabel: row.label,
        marketId: row.markets.id,
        marketTitle: row.markets.title,
        odds,
        available,
      },
    ]
  })

  const { multiplier, capped } = combineOdds(
    picks.flatMap((p) => (p.available && p.odds !== null ? [p.odds] : [])),
  )
  const canPlace = picks.length >= 2 && picks.every((p) => p.available)

  return { picks, multiplier, capped, canPlace }
}
