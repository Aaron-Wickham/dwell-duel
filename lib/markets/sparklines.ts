import type { DbClient } from '@/lib/supabase/database'
import { withSeededStart, type SeededMarket, type SeriesPoint } from '@/lib/markets/probability-series'
import { IN_CHUNK, chunk } from '@/lib/pagination/chunk'

export type SparklineMarket = { id: string } & SeededMarket

type SparklineRow = { market_id: string; points: { t: string; shares: Record<string, number> }[] }

async function rpcSparklines(supabase: DbClient, marketIds: string[]): Promise<SparklineRow[]> {
  const { data, error } = await supabase.rpc('market_sparklines', { p_market_ids: marketIds })
  if (error) throw error
  return (data ?? []) as SparklineRow[]
}

// Market ids go in chunks of IN_CHUNK, the cap market_sparklines itself puts on p_market_ids, so
// each call is at most 50 rows, one per market, however many cards the page shows.
export async function listSparklines(supabase: DbClient, markets: SparklineMarket[]): Promise<Map<string, SeriesPoint[]>> {
  const byMarket = new Map<string, SeriesPoint[]>()
  if (markets.length === 0) return byMarket
  const marketIds = markets.map((m) => m.id)

  const chunks = await Promise.all(chunk(marketIds, IN_CHUNK).map((part) => rpcSparklines(supabase, part)))
  const rows = new Map(chunks.flat().map((row) => [row.market_id, row.points]))
  for (const market of markets) {
    const points = (rows.get(market.id) ?? []).map((point) => ({ t: Date.parse(point.t), shares: point.shares }))
    byMarket.set(market.id, withSeededStart(points, market))
  }
  return byMarket
}

// Sparklines are decoration on /markets: if their read fails, the cards still render without them.
export async function readSparklines(supabase: DbClient, markets: SparklineMarket[]): Promise<Map<string, SeriesPoint[]>> {
  try {
    return await listSparklines(supabase, markets)
  } catch (error) {
    console.error('Market sparklines failed to load', error)
    return new Map()
  }
}
