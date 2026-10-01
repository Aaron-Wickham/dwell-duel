import { createHash } from 'node:crypto'
import { unstable_cache } from 'next/cache'
import type { DbClient } from '@/lib/supabase/database'
import { withSeededStart, type SeededMarket, type SeriesPoint } from '@/lib/markets/probability-series'
import { IN_CHUNK, chunk } from '@/lib/pagination/chunk'

// `version` is the list's sparkVersion: it moves whenever the market's series can (#252).
export type SparklineMarket = { id: string; version: string } & SeededMarket

// market_sparks' compact form (0088): each point is [epoch seconds, share, ...], the shares in
// outcomeIds' order. A market nobody has bet on has no points.
export type CompactSparkline = { outcomeIds: string[]; points: number[][] }

type SparkRow = { market_id: string; outcome_ids: string[]; points: number[][] | null }

const NO_POINTS: CompactSparkline = { outcomeIds: [], points: [] }

// Superseded batches are never read again; a week lets them expire, and a batch still in use
// is refetched once a week, which costs one RPC.
const BATCH_REVALIDATE_S = 7 * 24 * 60 * 60

async function rpcSparks(supabase: DbClient, marketIds: string[]): Promise<SparkRow[]> {
  const { data, error } = await supabase.rpc('market_sparks', { p_market_ids: marketIds })
  if (error) throw error
  return (data ?? []) as SparkRow[] // points is Json in the generated type
}

// Market ids go in chunks of IN_CHUNK, the cap market_sparklines puts on p_market_ids.
export async function fetchSparklines(supabase: DbClient, marketIds: string[]): Promise<Record<string, CompactSparkline>> {
  const chunks = await Promise.all(chunk(marketIds, IN_CHUNK).map((part) => rpcSparks(supabase, part)))
  const rows = new Map(chunks.flat().map((row) => [row.market_id, row]))
  return Object.fromEntries(
    marketIds.map((id) => {
      const row = rows.get(id)
      return [id, row ? { outcomeIds: row.outcome_ids, points: row.points ?? [] } : NO_POINTS]
    }),
  )
}

// The batch's cache key: every market in it with its version, order aside.
export function batchKey(markets: Pick<SparklineMarket, 'id' | 'version'>[]): string {
  const keys = markets.map((m) => `${m.id}:${m.version}`).sort()
  return createHash('sha256').update(keys.join(',')).digest('base64url')
}

// One Next data cache entry per list the page shows, keyed by its markets and their versions, so
// a render costs one cache read per list (#252). A settled list's key never moves; the open
// list's moves with each bet on one of its markets, and its next render refetches that list.
// market_sparks answers the same for every invited member (0088), so one member's read serves
// the next; it throws for anyone else, and a throw is never cached.
async function cachedBatch(supabase: DbClient, markets: SparklineMarket[]): Promise<Record<string, CompactSparkline>> {
  const ids = markets.map((m) => m.id)
  const read = unstable_cache(async (_batch: string) => fetchSparklines(supabase, ids), ['market-sparkline-batch-v1'], {
    revalidate: BATCH_REVALIDATE_S,
  })
  return read(batchKey(markets))
}

export function expandSparkline({ outcomeIds, points }: CompactSparkline): SeriesPoint[] {
  return points.map(([t, ...shares]) => ({
    t: t * 1000,
    shares: Object.fromEntries(outcomeIds.map((id, i) => [id, shares[i] ?? 0])),
  }))
}

// Each batch is one list on the page (open, awaiting, resolved).
export async function listSparklines(supabase: DbClient, batches: SparklineMarket[][]): Promise<Map<string, SeriesPoint[]>> {
  const nonEmpty = batches.filter((batch) => batch.length > 0)
  const compact = await Promise.all(nonEmpty.map((batch) => cachedBatch(supabase, batch)))
  const byMarket = new Map<string, SeriesPoint[]>()
  nonEmpty.forEach((batch, i) => {
    for (const market of batch) {
      byMarket.set(market.id, withSeededStart(expandSparkline(compact[i][market.id] ?? NO_POINTS), market))
    }
  })
  return byMarket
}

// Sparklines are decoration on /markets: if their read fails, the cards still render without them.
export async function readSparklines(supabase: DbClient, batches: SparklineMarket[][]): Promise<Map<string, SeriesPoint[]>> {
  try {
    return await listSparklines(supabase, batches)
  } catch (error) {
    console.error('Market sparklines failed to load', error)
    return new Map()
  }
}
