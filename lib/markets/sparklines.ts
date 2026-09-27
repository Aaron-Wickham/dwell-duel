import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeriesPoint } from '@/lib/markets/probability-series'
import { IN_CHUNK, chunk } from '@/lib/pagination/chunk'

type SparklineRow = { market_id: string; points: { t: string; shares: Record<string, number> }[] }

async function rpcSparklines(supabase: SupabaseClient, marketIds: string[]): Promise<SparklineRow[]> {
  const { data, error } = await supabase.rpc('market_sparklines', { p_market_ids: marketIds })
  if (error) throw error
  return (data ?? []) as SparklineRow[]
}

// Market ids go in chunks of IN_CHUNK, the cap market_sparklines itself puts on p_market_ids, so
// each call is at most 50 rows, one per market, however many cards the page shows.
export async function listSparklines(supabase: SupabaseClient, marketIds: string[]): Promise<Map<string, SeriesPoint[]>> {
  const byMarket = new Map<string, SeriesPoint[]>()
  if (marketIds.length === 0) return byMarket
  for (const id of marketIds) byMarket.set(id, [])

  const chunks = await Promise.all(chunk(marketIds, IN_CHUNK).map((part) => rpcSparklines(supabase, part)))
  for (const row of chunks.flat()) {
    if (!byMarket.has(row.market_id)) continue
    byMarket.set(
      row.market_id,
      row.points.map((point) => ({ t: Date.parse(point.t), shares: point.shares })),
    )
  }
  return byMarket
}

// Sparklines are decoration on /markets: if their read fails, the cards still render without them.
export async function readSparklines(supabase: SupabaseClient, marketIds: string[]): Promise<Map<string, SeriesPoint[]>> {
  try {
    return await listSparklines(supabase, marketIds)
  } catch (error) {
    console.error('Market sparklines failed to load', error)
    return new Map()
  }
}
