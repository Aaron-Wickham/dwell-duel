import { unstable_cache } from 'next/cache'
import type { DbClient } from '@/lib/supabase/database'
import { withSeededStart, type SeededMarket, type SeriesPoint } from '@/lib/markets/probability-series'
import { IN_CHUNK, chunk } from '@/lib/pagination/chunk'

// `version` is the list's sparkVersion: it moves whenever the market's series can, so a card's
// series is read from the database only the first time a version is seen (#252).
export type SparklineMarket = { id: string; version: string } & SeededMarket

// market_sparks' compact form (0088): each point is [epoch seconds, share, ...], the shares in
// outcomeIds' order. A market nobody has bet on has no points.
export type CompactSparkline = { outcomeIds: string[]; points: number[][] }

type SparkRow = { market_id: string; outcome_ids: string[]; points: number[][] | null }

const NO_POINTS: CompactSparkline = { outcomeIds: [], points: [] }

async function rpcSparks(supabase: DbClient, marketIds: string[]): Promise<SparkRow[]> {
  const { data, error } = await supabase.rpc('market_sparks', { p_market_ids: marketIds })
  if (error) throw error
  return (data ?? []) as SparkRow[] // points is Json in the generated type
}

// Market ids go in chunks of IN_CHUNK, the cap market_sparklines puts on p_market_ids.
export async function fetchSparklines(supabase: DbClient, marketIds: string[]): Promise<Map<string, CompactSparkline>> {
  const chunks = await Promise.all(chunk(marketIds, IN_CHUNK).map((part) => rpcSparks(supabase, part)))
  const rows = new Map(chunks.flat().map((row) => [row.market_id, row]))
  return new Map(
    marketIds.map((id) => {
      const row = rows.get(id)
      return [id, row ? { outcomeIds: row.outcome_ids, points: row.points ?? [] } : NO_POINTS]
    }),
  )
}

class NotCached extends Error {}

// Every member sees every market's series, so one member's read serves the next. The cached
// function only ever returns what this request has already fetched, or throws, which Next doesn't
// cache: the first pass finds what is cached, one RPC fetches the rest, and a second pass stores
// them under the same key (the function's source is part of Next's key, so both passes share it).
// Missing versions are fetched together, outside the cache scope, rather than one call per card.
async function cachedSparklines(supabase: DbClient, markets: SparklineMarket[]): Promise<Map<string, CompactSparkline>> {
  const fetched = new Map<string, CompactSparkline>()
  const cached = unstable_cache(
    async (id: string, _version: string): Promise<CompactSparkline> => {
      const sparkline = fetched.get(id)
      if (!sparkline) throw new NotCached()
      return sparkline
    },
    ['market-sparkline-v1'],
    { tags: ['market-sparklines'] },
  )
  const read = (m: SparklineMarket) => cached(m.id, m.version).catch((error: unknown) => {
    if (error instanceof NotCached) return null
    throw error
  })

  const first = await Promise.all(markets.map(read))
  const missing = markets.filter((_, i) => first[i] === null)
  const byMarket = new Map(markets.flatMap((m, i) => (first[i] ? [[m.id, first[i]] as const] : [])))
  if (missing.length === 0) return byMarket

  for (const [id, sparkline] of await fetchSparklines(supabase, missing.map((m) => m.id))) fetched.set(id, sparkline)
  const stored = await Promise.all(missing.map((m) => cached(m.id, m.version)))
  missing.forEach((m, i) => byMarket.set(m.id, stored[i]))
  return byMarket
}

export function expandSparkline({ outcomeIds, points }: CompactSparkline): SeriesPoint[] {
  return points.map(([t, ...shares]) => ({
    t: t * 1000,
    shares: Object.fromEntries(outcomeIds.map((id, i) => [id, shares[i] ?? 0])),
  }))
}

export async function listSparklines(supabase: DbClient, markets: SparklineMarket[]): Promise<Map<string, SeriesPoint[]>> {
  const byMarket = new Map<string, SeriesPoint[]>()
  if (markets.length === 0) return byMarket
  const compact = await cachedSparklines(supabase, markets)
  for (const market of markets) {
    byMarket.set(market.id, withSeededStart(expandSparkline(compact.get(market.id) ?? NO_POINTS), market))
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
