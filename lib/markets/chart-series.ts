import type { DbClient } from '@/lib/supabase/database'
import type { SeriesPoint } from '@/lib/markets/probability-series'

// The market page's chart shows at most this many points, sampled in SQL by market_sparklines
// (the cards' sparklines, at 40): a busy market no longer ships every bet to the server (#68).
export const CHART_POINTS = 200

export type ChartSeries = { points: SeriesPoint[]; betCount: number }

// Pools start at the market's seed (0041), so a seeded market's line starts at an even split
// when it opened, rather than at its first bet.
export async function getChartSeries(
  supabase: DbClient,
  market: { id: string; seedPerOutcome: number; createdAt: string; outcomeIds: string[] },
): Promise<ChartSeries> {
  const [sampled, counted] = await Promise.all([
    supabase.rpc('market_sparklines', { p_market_ids: [market.id], p_points: CHART_POINTS }),
    supabase.from('bets').select('id', { count: 'exact', head: true }).eq('market_id', market.id),
  ])
  if (sampled.error) throw sampled.error
  if (counted.error) throw counted.error

  const row = (sampled.data ?? []).find((r) => r.market_id === market.id)
  const points: SeriesPoint[] = ((row?.points ?? []) as { t: string; shares: Record<string, number> }[]).map((p) => ({
    t: Date.parse(p.t),
    shares: p.shares,
  }))
  if (market.seedPerOutcome > 0 && market.outcomeIds.length > 0) {
    const even = 1 / market.outcomeIds.length
    points.unshift({ t: Date.parse(market.createdAt), shares: Object.fromEntries(market.outcomeIds.map((id) => [id, even])) })
  }
  return { points, betCount: counted.count ?? 0 }
}
